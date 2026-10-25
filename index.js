/**
 * subagent-panel 的 Host 半。
 *
 * 全部逻辑在 client.js 里（读 Client 的 sessions 列表快照，不请求 Host）；
 * bundle 行仍需要一个可激活的 Host 插件，所以这里保持空实现。
 */
export function apply() {}
