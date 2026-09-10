/** Fixed diagnostics only: never expose provider bodies, exception messages or credentials. */
const messages = {
  authentication_failed: "模型服务拒绝了此 Key（HTTP 401），请核对是否为当前服务的有效 Key。",
  permission_denied: "模型服务拒绝访问（HTTP 403），请检查此 Key 的模型权限。",
  model_not_found: "模型服务未找到请求的接口或模型（HTTP 404），请检查固定服务和模型配置。",
  request_rejected:
    "模型服务不接受当前请求参数，请检查模型是否支持 Chat Completions 和严格 JSON Schema。",
  rate_limited: "模型服务限流或额度受限（HTTP 429），请稍后重试或检查服务额度。",
  upstream_error: "模型服务暂时不可用，请稍后重试。",
  network_error: "未能连接模型服务，请检查网络和服务地址。",
  invalid_response: "模型服务已响应，但未返回符合交涉格式的完整 JSON；请检查模型的结构化输出支持。",
  timeout: "等待模型回应超时，请稍后重试；这不能说明 Key 无效。",
  cancelled: "模型请求已取消，游戏进度未改变。",
} as const;
type ModelFailureCode = keyof typeof messages;

export function modelFailure(code: ModelFailureCode, upstreamStatus?: number) {
  return { code, error: messages[code], ...(upstreamStatus ? { upstreamStatus } : {}) };
}

export function upstreamFailure(status: number) {
  const code =
    status === 401
      ? "authentication_failed"
      : status === 403
        ? "permission_denied"
        : status === 404
          ? "model_not_found"
          : status === 400 || status === 422
            ? "request_rejected"
            : status === 429
              ? "rate_limited"
              : "upstream_error";
  return modelFailure(code, status);
}

export function safeModelFailure(value: unknown) {
  const code = value && typeof value === "object" && "code" in value ? value.code : undefined;
  return modelFailure(
    typeof code === "string" && Object.hasOwn(messages, code)
      ? (code as ModelFailureCode)
      : "upstream_error",
  );
}
