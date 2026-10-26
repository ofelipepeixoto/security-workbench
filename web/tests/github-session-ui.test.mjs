import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render the actual component. Browser focus/expiry/event behavior is exercised
// through its actual session monitor in github-session.test.mjs; no live login.
const root = fileURLToPath(new URL('../',import.meta.url));
const output = await mkdtemp(join(root,'.session-render-'));
let GitHubSessionBadge, GitHubSessionStatus;
try {
  const source=await readFile(join(root,'components/github-session-status.tsx'),'utf8');
  const target=join(output,'components/github-session-status.mjs');
  await mkdir(dirname(target),{recursive:true}); await mkdir(join(output,'lib'),{recursive:true});
  await writeFile(target,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText);
  await copyFile(join(root,'lib/github-session-monitor.mjs'),join(output,'lib/github-session-monitor.mjs'));
  ({GitHubSessionBadge,GitHubSessionStatus}=await import(pathToFileURL(target).href));
} finally { await rm(output,{recursive:true,force:true}); }

const snapshot=()=>({state:'authenticated',provider:'github',displayName:'fixture-owner',sessionKey:'a'.repeat(43),verifiedAt:Date.now(),expiresAt:Date.now()+120_000});
const render=(model,demo=false)=>renderToStaticMarkup(React.createElement(GitHubSessionBadge,{model,demo,githubReady:true,onLogout:()=>{}}));

test('actual badge renders account name and a local GitHub mark with accessible separate App explanation',()=>{
  const html=render({state:'authenticated',session:snapshot()});
  assert.match(html,/github-session--authenticated/); assert.match(html,/Sessão GitHub validada/); assert.match(html,/fixture-owner/);
  assert.match(html,/<summary><svg[^>]*viewBox="0 0 16 16"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html,/<img|avatars\.github|\.githubusercontent|sessionKey|csrf|aaaaaaa/);
  assert.match(html,/role="status" aria-live="polite"/); assert.match(html,/opções da conta/);
  for(const path of ['/profile','/account','/repositories']) assert.ok(html.includes(`href="${path}"`));
  assert.match(html,/Sair da conta/); assert.match(html,/acesso aos repositórios é conferido separadamente/);
});

test('demo never gets green even when the Workbench login is valid',()=>{
  const html=render({state:'authenticated',session:snapshot()},true);
  assert.match(html,/github-session--demo/); assert.match(html,/Demonstração · dados fictícios/); assert.match(html,/fixture-owner/);
  assert.doesNotMatch(html,/github-session--authenticated|Sessão GitHub validada/);
});

test('anonymous, pending, expired, unavailable and logout failures never advertise validated session',()=>{
  for(const state of ['anonymous','checking','expired','unavailable','changed','signing_out','logout_error']) {
    const html=render({state}); assert.doesNotMatch(html,/github-session--authenticated|Sessão GitHub validada|fixture-owner/);
    if(state==='changed') assert.match(html,/Recarregar sessão/);
    if(state==='logout_error') assert.match(html,/role="alert".*A saída não foi confirmada/);
    if(['anonymous','expired','unavailable'].includes(state)) assert.match(html,/href="\/api\/auth\/github\/start"/);
  }
});

test('external session loss suppresses green without masking a specific monitor failure',()=>{
  const html=renderToStaticMarkup(React.createElement(GitHubSessionStatus,{initialSession:snapshot(),demo:false,githubReady:true,csrfToken:'inert',sessionLost:true}));
  assert.match(html,/Sessão expirada/); assert.doesNotMatch(html,/github-session--authenticated|Sessão GitHub validada/);
});
