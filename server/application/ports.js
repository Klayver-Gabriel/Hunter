/**
 * SheetRepository: list(owner), get(owner,id), create(owner,content),
 * update(owner,id,{revision,mutation,...content}), remove(owner,id,revision,mutation).
 * Queries are scoped by owner; conditional mutations are atomic.
 * Null means missing/conflict; exceptions mean persistence failure.
 * IdentityProvider: start() -> {url,state,nonce,verifier}; finish(url,flow) -> {issuer,subject,name}.
 * AuthRepository: putFlow, takeFlow (single use), createSession, getSession, revokeSession.
 * RateLimiter: consume(key,limit,windowSeconds) -> {allowed,retryAfter} across all instances.
 */
export {};
