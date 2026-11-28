// 订单与身份服务层：所有订单数据读写的唯一出口
// 微信端 + 已配置云环境时走云函数/云数据库；否则降级为 localStorage mock（H5 预览可用）
import Taro from '@tarojs/taro'
import { CLOUD_ENV_ID, MOCK_STAFF } from '../config'
import type { CartItem } from '../store/cart'
import { adjustMockStock, invalidateGoodsCache } from './goods'

export interface Order {
  id: string
  openid: string
  items: CartItem[]
  total: number
  pickupCode: string // 6 位取件码，到店核销
  // paid=待取件 refund_requested=退款申请中 refunded=已退款 completed=已核销 cancelled=已取消
  status: 'paid' | 'refund_requested' | 'refunded' | 'completed' | 'cancelled'
  createdAt: number
  completedAt?: number // 核销完成时间（商家端"今日已核销"按此过滤）
  refundRequestedAt?: number // 顾客申请退款时间
  refundedAt?: number // 商家同意退款时间
}

// 微信端且配置了云环境才启用真实云端
const cloudReady = () =>
  process.env.TARO_ENV === 'weapp' && !!CLOUD_ENV_ID && !!(Taro as any).cloud

const callCloud = async (name: string, data: Record<string, unknown>) => {
  const res = await (Taro as any).cloud.callFunction({ name, data })
  return res.result
}

// ---------- 身份 ----------

// 买家免授权登录：真实模式由云函数从调用上下文取 openid；mock 返回固定账号
export async function getOpenId(): Promise<string> {
  if (cloudReady()) {
    const res = await callCloud('login', {})
    Taro.setStorageSync('openid', res.openid)
    return res.openid as string
  }
  let openid = Taro.getStorageSync('mock_openid') as string
  if (!openid) {
    openid = 'mock-user-' + Math.random().toString(36).slice(2, 8)
    Taro.setStorageSync('mock_openid', openid)
  }
  return openid
}

// 是否店员：真实模式每次实时查询 login 云函数（函数轻量且 staff 白名单可能变动，不做本地缓存）
export async function isStaff(): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('login', {})
    return res.isStaff === true
  }
  return MOCK_STAFF
}

// ---------- 订单 ----------

// 创建订单（支付成功后调用），返回含取件码的完整订单
// 云端创建失败（库存不足/商品下架等）时抛出携带原因的 Error
export async function createOrder(items: CartItem[], total: number): Promise<Order> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'create', items, total })
    if (res.code === 'CREATE_FAILED') {
      throw new Error(res.errMsg || '下单失败')
    }
    // 下单已扣减库存，失效商品缓存，首页/详情页下次读取拿到新库存
    invalidateGoodsCache()
    return res.order as Order
  }
  const order: Order = {
    id: 'mock-' + Date.now(),
    openid: await getOpenId(),
    items,
    total,
    pickupCode: String(Math.floor(100000 + Math.random() * 900000)),
    status: 'paid',
    createdAt: Date.now()
  }
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  Taro.setStorageSync('mock_orders', [order, ...list])
  // mock 模式同步扣减本地库存，并失效商品缓存
  adjustMockStock(items, -1)
  invalidateGoodsCache()
  return order
}

// 买家：我的订单
export async function listMyOrders(): Promise<Order[]> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'listMine' })
    return res.list as Order[]
  }
  const openid = await getOpenId()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  return list.filter(o => o.openid === openid)
}

// 商家：全部订单（真实模式在云函数内校验 staff，非店员调用会抛错）
// 商家：按状态筛选拉取订单（statuses 为空 = 全部；skip 分页偏移）
// hasMore 由服务端按"整页拉满"判断，前端据此决定是否显示加载更多
export async function listAllOrders(statuses: Order['status'][] = [], skip = 0): Promise<{ list: Order[]; hasMore: boolean }> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'listAll', statuses, skip })
    return { list: res.list as Order[], hasMore: res.hasMore === true }
  }
  const all = ((Taro.getStorageSync('mock_orders') as Order[]) || [])
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter(o => statuses.length === 0 || statuses.includes(o.status))
  return { list: all.slice(skip, skip + 20), hasMore: skip + 20 < all.length }
}

// 买家：对已付款订单发起退款申请（商家审核，同意后退款并回补库存）
// mock 模式状态存本地；真实支付接入后云函数在此对接原路退款
export async function requestRefund(id: string): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'requestRefund', id })
    return res.ok === true
  }
  const openid = await getOpenId()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const target = list.find(o => o.id === id && o.openid === openid && o.status === 'paid')
  if (!target) return false
  target.status = 'refund_requested'
  target.refundRequestedAt = Date.now()
  Taro.setStorageSync('mock_orders', list)
  return true
}

// 商家：处理退款申请（approve=true 同意退款并回补库存；false 拒绝回待取件）
export async function handleRefund(id: string, approve: boolean): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'handleRefund', id, approve })
    const ok = res.ok === true
    // 同意退款后库存已在云端回补，失效本地商品缓存避免各页显示旧库存
    if (ok && approve) invalidateGoodsCache()
    return ok
  }
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const target = list.find(o => o.id === id && o.status === 'refund_requested')
  if (!target) return false
  target.status = approve ? 'refunded' : 'paid'
  if (approve) {
    target.refundedAt = Date.now()
    adjustMockStock(target.items, 1)
  }
  Taro.setStorageSync('mock_orders', list)
  return true
}

// 买家：删除自己的订单记录（已核销/已取消均可删；成功返回 true）
export async function deleteOrder(id: string): Promise<boolean> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'delete', id })
    return res.ok === true
  }
  const openid = await getOpenId()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const next = list.filter(o => !(o.id === id && o.openid === openid))
  if (next.length === list.length) return false
  Taro.setStorageSync('mock_orders', next)
  return true
}

// 商家：按取件码核销，成功返回核销后的订单，未找到返回 null
// 云端限流（连错锁定）或码无效时抛出携带原因的 Error
export async function verifyPickup(pickupCode: string): Promise<Order | null> {
  if (cloudReady()) {
    const res = await callCloud('order', { action: 'verifyPickup', pickupCode })
    if (res.code === 'LOCKED' || res.code === 'NOT_FOUND') {
      throw new Error(res.errMsg || '核销失败')
    }
    return (res.order as Order) || null
  }
  const code = pickupCode.trim()
  const list = (Taro.getStorageSync('mock_orders') as Order[]) || []
  const target = list.find(o => o.pickupCode === code && o.status === 'paid')
  if (!target) return null
  target.status = 'completed'
  target.completedAt = Date.now()
  Taro.setStorageSync('mock_orders', list)
  return target
}
