// 云开发配置
// CLOUD_ENV_ID：云开发环境 ID。为空串时订单走 mock 模式（localStorage 存储，H5 预览可用）。
// 开通云开发并创建环境后，把环境 ID 填入即可自动切换为真实云端。
export const CLOUD_ENV_ID = 'cloud1-d0gsfdu4q5fe40e7f'

// mock 模式下的商家演示开关：true 时当前访客视为店员，可看到「商家管理」入口。
// 仅在 mock 模式生效；真实模式下商家身份由云函数查询 staff 集合判定。
export const MOCK_STAFF = true

// 订阅消息模板 ID（模板：预约提醒，用于新订单通知商家）。
// 须与 cloud/functions/order/index.js 中的 SUBSCRIBE_TEMPLATE_ID 保持一致。
export const SUBSCRIBE_TEMPLATE_ID = 'yvAdCkOg8vHPCQklmeZAKAoZt2B5uxrb-DKwGp_6LSs'
