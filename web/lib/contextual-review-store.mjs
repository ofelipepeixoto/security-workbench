/** D1 adapter. No policy is created or enabled here. Reads never cross owner. */
export function createContextualReviewStore(db) {
  if (!db?.prepare) throw new Error('Contextual storage unavailable');
  const first = (sql, ...values) => db.prepare(sql).bind(...values).first();
  const write = async (sql, ...values) => {
    const result = await db.prepare(sql).bind(...values).run();
    if (result?.success !== true) throw new Error('Contextual storage did not confirm');
    return result.meta?.changes ?? 0;
  };
  return {
    async policy() { return first('SELECT * FROM workbench_contextual_policy WHERE id=1'); },
    async get(ownerId, key, timestamp) {
      // Expiration deletes generated text at the next request. The minimal,
      // non-source financial ledger is retained and never resets paid quota.
      await write("UPDATE workbench_contextual_reviews SET result_json=NULL,outcome_unknown=CASE WHEN state IN ('reserved','sending') THEN 1 ELSE outcome_unknown END,state='expired',updated_at=? WHERE owner_id=? AND review_key=? AND expires_at<=? AND state NOT IN ('deleted','expired')", timestamp, ownerId, key, timestamp);
      return first('SELECT * FROM workbench_contextual_reviews WHERE owner_id=? AND review_key=?', ownerId, key);
    },
    async reserve(record) {
      try {
        const changed = await write(`INSERT OR IGNORE INTO workbench_contextual_reviews
          (id,owner_id,run_id,repository_id,revision,review_key,policy_version,model,state,reserved_micro_usd,input_bytes,created_at,expires_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?, 'reserved',?,?,?,?,?)`,
        record.id, record.owner_id, record.run_id, record.repository_id, record.revision, record.review_key,
        record.policy_version, record.model, record.reserved_micro_usd, record.input_bytes, record.created_at, record.expires_at, record.created_at);
        return changed === 1;
      } catch {
        // A trigger/constraint denial does not expose another user's name,
        // repository or shared budget usage. The caller can re-read its own key.
        return false;
      }
    },
    async claim(ownerId, id, timestamp) {
      return (await write("UPDATE workbench_contextual_reviews SET state='sending',updated_at=? WHERE owner_id=? AND id=? AND state='reserved' AND expires_at>? AND EXISTS(SELECT 1 FROM workbench_contextual_policy p WHERE p.id=1 AND p.enabled=1 AND p.version=workbench_contextual_reviews.policy_version AND p.model=workbench_contextual_reviews.model AND ?>=p.starts_at AND ?<p.ends_at AND ?<p.price_expires_at)", timestamp, ownerId, id, timestamp, timestamp, timestamp, timestamp)) === 1;
    },
    async finish(ownerId, id, result, timestamp) {
      return (await write(`UPDATE workbench_contextual_reviews SET state=?,result_json=?,actual_micro_usd=?,input_tokens=?,output_tokens=?,input_bytes=?,output_bytes=?,duration_ms=?,failure_code=?,updated_at=?
        WHERE owner_id=? AND id=? AND state='sending' AND expires_at>?`,
      result.state, result.result_json ?? null, result.actual_micro_usd ?? null, result.input_tokens ?? null, result.output_tokens ?? null,
      result.input_bytes, result.output_bytes ?? null, result.duration_ms ?? null, result.failure_code ?? null, timestamp, ownerId, id, timestamp)) === 1;
    },
    async unknown(ownerId, id, timestamp, durationMs) {
      await write("UPDATE workbench_contextual_reviews SET state='unknown',outcome_unknown=1,result_json=NULL,failure_code='outcome_unknown',duration_ms=?,updated_at=? WHERE owner_id=? AND id=? AND state IN ('reserved','sending')", durationMs, timestamp, ownerId, id);
    },
    async delete(ownerId, key, timestamp) {
      return (await write("UPDATE workbench_contextual_reviews SET state='deleted',outcome_unknown=CASE WHEN state IN ('reserved','sending') THEN 1 ELSE outcome_unknown END,result_json=NULL,updated_at=? WHERE owner_id=? AND review_key=? AND state<>'deleted'", timestamp, ownerId, key)) > 0;
    },
    async expire(timestamp) {
      // Explicit operator/maintenance hook; this module installs no scheduler.
      return write("UPDATE workbench_contextual_reviews SET state='expired',outcome_unknown=CASE WHEN state IN ('reserved','sending') THEN 1 ELSE outcome_unknown END,result_json=NULL,updated_at=? WHERE expires_at<=? AND state NOT IN ('deleted','expired')", timestamp, timestamp);
    },
  };
}
