// 订单云函数：create 创建订单 / listMine 我的订单 / listAll 商家全部订单 / verifyPickup 取件核销
// 商家操作统一在云函数内校验 staff 集合，前端无越权口子
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 订阅消息配置（模板：预约提醒，模板编号 8720，个人主体借用通用模板）
// 关键词编号以 mp 后台「我的模板 → 模板详情」展示的 {{xx.DATA}} 为准，若后台换模板需同步修改
const SUBSCRIBE_TEMPLATE_ID = 'yvAdCkOg8vHPCQklmeZAKAoZt2B5uxrb-DKwGp_6LSs'
const SUBSCRIBE_PAGE = 'pages/admin/verify/index'
const SUBSCRIBE_KEYS = {
  code: 'character_string32', // 预约编号 → 订单号
  items: 'thing2',            // 预约项目 → 商品 × 数量
  time: 'time3',              // 预约时间 → 下单时间
  shop: 'thing10',            // 预约门店 → 店名
  tip: 'thing4'               // 温馨提示 → 金额 + 核销提示
}

async function assertStaff(openid) {
  const res = await db.collection('staff').where({ openid }).count()
  if (res.total === 0) {
    throw new Error('无商家权限')
  }
}

// 订阅消息字段：thing 类型最长 20 字且不能纯数字，超长截断
const clip = (s, n = 20) => String(s).slice(0, n)

// 下单后给所有店员发订阅消息（一次性订阅：店员需先在小程序端授权，43101=未授权跳过）
// 发送失败只记日志，不阻塞下单
async function notifyStaff(order) {
  let staffRes
  try {
    staffRes = await db.collection('staff').get()
  } catch (e) {
    console.warn('订阅消息：staff 集合读取失败', e.errMsg || e.message)
    return
  }
  // 云函数容器为 UTC 时区，getHours 会少 8 小时；手动偏移到北京时间再取字段
  const d = new Date(order.createdAt + 8 * 3600 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  const timeText = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const itemsText = order.items.map(i => `${i.name}×${i.qty}`).join('；')
  const data = {
    [SUBSCRIBE_KEYS.code]: { value: clip(String(order.pickupCode), 32) },
    [SUBSCRIBE_KEYS.items]: { value: clip(itemsText) },
    [SUBSCRIBE_KEYS.time]: { value: timeText },
    [SUBSCRIBE_KEYS.shop]: { value: clip('衣码购 门店自提') },
    [SUBSCRIBE_KEYS.tip]: { value: clip(`顾客已付${order.total}元,请备货核销`) }
  }
  for (const staff of staffRes.data) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: staff.openid,
        templateId: SUBSCRIBE_TEMPLATE_ID,
        page: SUBSCRIBE_PAGE,
        data
      })
    } catch (e) {
      // 43101=该用户未订阅/授权次数已用完，属正常情况，静默跳过
      if (e.errCode !== 43101) {
        console.warn('订阅消息发送失败', staff.openid, e.errCode, e.errMsg)
      }
    }
  }
}

function toOrder(doc) {
  return { ...doc, id: doc._id }
}

// SKU key：`颜色-尺码`（与商品 stocks 字段的 key 一致）
const skuKey = (item) => `${item.color}-${item.size}`

// 按 productId 聚合各 SKU 的变动量（同一订单里同商品多行合并，避免快照互相覆盖）
function aggregateByProduct(items, sign) {
  const result = new Map()
  for (const item of items || []) {
    const acc = result.get(item.productId) || {}
    const key = skuKey(item)
    acc[key] = (acc[key] || 0) + item.qty * sign
    result.set(item.productId, acc)
  }
  return result
}

// 取消订单回补库存（商品已下架/未设库存则跳过，回补失败不影响取消）
// 读出整个 stocks 映射、内存计算后整包写回——不用点路径/inc，对中文 key 稳定
async function restock(items) {
  const byProduct = aggregateByProduct(items, 1)
  for (const [productId, changes] of byProduct) {
    try {
      const snap = await db.collection('goods').doc(productId).get()
      const goods = snap.data
      if (!goods || !goods.stocks) continue
      const stocks = { ...goods.stocks }
      for (const [key, delta] of Object.entries(changes)) {
        const cur = stocks[key]
        if (typeof cur === 'number' && cur !== -1) {
          stocks[key] = cur + delta
        }
      }
      await db.collection('goods').doc(productId).update({ data: { stocks } })
    } catch (e) {
      // 商品可能已被删除，忽略
    }
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, items, total, pickupCode } = event

  // 控制台「测试」没有微信用户上下文（OPENID 为空），直接给友好提示，避免堆栈报错
  if (!OPENID) {
    return { code: 'NO_USER_CONTEXT', errMsg: '控制台测试无用户身份，请从小程序端真实调用验证' }
  }

  if (action === 'create') {
    // 库存校验 + 扣减 + 写订单放进事务，防止并发下单超卖
    // stocks 整包读改写，不用点路径/inc（中文 key 下点路径更新不可靠）
    const transaction = await db.startTransaction()
    try {
      const byProduct = aggregateByProduct(items, -1)
      for (const [productId, changes] of byProduct) {
        const snap = await transaction.collection('goods').doc(productId).get()
        const goods = snap.data
        if (!goods || !goods.name) {
          throw new Error(`商品已下架，请刷新后重试`)
        }
        if (goods.stocks) {
          const stocks = { ...goods.stocks }
          for (const [key, delta] of Object.entries(changes)) {
            const cur = stocks[key]
            // -1 / 缺省 = 不限库存
            if (typeof cur === 'number' && cur !== -1) {
              if (cur < -delta) {
                const [color, size] = key.split('-')
                throw new Error(`「${goods.name} ${color}/${size}」库存不足，仅剩 ${Math.max(0, cur)} 件`)
              }
              stocks[key] = cur + delta
            }
          }
          await transaction.collection('goods').doc(productId).update({ data: { stocks } })
        }
      }
      const order = {
        openid: OPENID,
        items,
        total,
        pickupCode: String(Math.floor(100000 + Math.random() * 900000)),
        status: 'paid',
        createdAt: Date.now()
      }
      const res = await transaction.collection('orders').add({ data: order })
      await transaction.commit()
      // 通知店员（不阻塞下单结果，失败仅记日志）
      await notifyStaff({ ...order, _id: res._id })
      return { order: toOrder({ ...order, _id: res._id }) }
    } catch (e) {
      console.error('创建订单失败:', e.errMsg || e.message || e)
      try {
        await transaction.rollback()
      } catch (rollbackErr) {
        // 已 commit 或未开始时的 rollback 异常，忽略
      }
      return { code: 'CREATE_FAILED', errMsg: e.errMsg || e.message || '下单失败' }
    }
  }

  if (action === 'listMine') {
    const res = await db.collection('orders')
      .where({ openid: OPENID })
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
    return { list: res.data.map(toOrder) }
  }

  if (action === 'listAll') {
    await assertStaff(OPENID)
    // 订单量增长后商家按状态分标签查看：服务端过滤 + 分页，避免一次拉全量
    const PAGE_SIZE = 20
    const _ = db.command
    let query = db.collection('orders')
    if (Array.isArray(event.statuses) && event.statuses.length > 0) {
      query = query.where({ status: _.in(event.statuses) })
    }
    const res = await query
      .orderBy('createdAt', 'desc')
      .skip(event.skip || 0)
      .limit(PAGE_SIZE)
      .get()
    return { list: res.data.map(toOrder), hasMore: res.data.length === PAGE_SIZE }
  }

  if (action === 'verifyPickup') {
    await assertStaff(OPENID)
    // 防暴力猜测：6 位取件码可被穷举，同一店员连错 5 次锁定 10 分钟
    const MAX_FAILS = 5
    const LOCK_MS = 10 * 60 * 1000
    try {
      await db.createCollection('rate_limits')
    } catch (e) {
      // 集合已存在，忽略
    }
    const now = Date.now()
    let limit = { fails: 0, lockedUntil: 0 }
    try {
      const snap = await db.collection('rate_limits').doc(`verify_${OPENID}`).get()
      limit = { fails: snap.data.fails || 0, lockedUntil: snap.data.lockedUntil || 0 }
    } catch (e) {
      // 首次核销，无记录
    }
    if (limit.lockedUntil > now) {
      const mins = Math.ceil((limit.lockedUntil - now) / 60000)
      return { code: 'LOCKED', errMsg: `核销失败次数过多，请 ${mins} 分钟后再试` }
    }

    const found = await db.collection('orders')
      .where({ pickupCode, status: 'paid' })
      .get()
    if (!found.data.length) {
      const fails = limit.fails + 1
      const locked = fails >= MAX_FAILS
      await db.collection('rate_limits').doc(`verify_${OPENID}`).set({
        data: { openid: OPENID, fails: locked ? 0 : fails, lockedUntil: locked ? now + LOCK_MS : 0, updatedAt: now }
      })
      return {
        code: 'NOT_FOUND',
        errMsg: locked
          ? `连续 ${MAX_FAILS} 次核销失败，已锁定 10 分钟`
          : `取件码无效（连续错误 ${fails}/${MAX_FAILS} 次）`
      }
    }

    // 核销成功：清空失败计数
    if (limit.fails > 0 || limit.lockedUntil > 0) {
      await db.collection('rate_limits').doc(`verify_${OPENID}`).set({
        data: { openid: OPENID, fails: 0, lockedUntil: 0, updatedAt: now }
      })
    }
    const doc = found.data[0]
    await db.collection('orders').doc(doc._id).update({
      data: { status: 'completed', completedAt: Date.now() }
    })
    return { order: toOrder({ ...doc, status: 'completed' }) }
  }

  if (action === 'requestRefund') {
    // 顾客对已付款订单发起退款申请（状态流转版：真实支付接入后在此处对接原路退款）
    const found = await db.collection('orders')
      .where({ _id: event.id, openid: OPENID, status: 'paid' })
      .get()
    if (!found.data.length) {
      return { ok: false }
    }
    await db.collection('orders').doc(event.id).update({
      data: { status: 'refund_requested', refundRequestedAt: Date.now() }
    })
    return { ok: true }
  }

  if (action === 'handleRefund') {
    // 商家处理退款申请：同意 → refunded 终态并回补库存；拒绝 → 回 paid（可核销/可再次申请）
    await assertStaff(OPENID)
    const approve = event.approve === true
    const found = await db.collection('orders')
      .where({ _id: event.id, status: 'refund_requested' })
      .get()
    if (!found.data.length) {
      return { ok: false }
    }
    const doc = found.data[0]
    await db.collection('orders').doc(event.id).update({
      data: approve
        ? { status: 'refunded', refundedAt: Date.now() }
        : { status: 'paid', refundRejectedAt: Date.now() }
    })
    if (approve) {
      await restock(doc.items)
    }
    return { ok: true }
  }

  if (action === 'delete') {
    // 买家删除自己的订单记录（cloud 数据库 doc() 不支持组合 where，先查再删）
    const found = await db.collection('orders')
      .where({ _id: event.id, openid: OPENID })
      .get()
    if (!found.data.length) {
      return { ok: false }
    }
    await db.collection('orders').doc(event.id).remove()
    return { ok: true }
  }

  throw new Error('未知 action: ' + action)
}
