// 订单云函数：create 创建订单 / listMine 我的订单 / listAll 商家全部订单 / verifyPickup 取件核销
// 商家操作统一在云函数内校验 staff 集合，前端无越权口子
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertStaff(openid) {
  const res = await db.collection('staff').where({ openid }).count()
  if (res.total === 0) {
    throw new Error('无商家权限')
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
    const res = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    return { list: res.data.map(toOrder) }
  }

  if (action === 'verifyPickup') {
    await assertStaff(OPENID)
    const found = await db.collection('orders')
      .where({ pickupCode, status: 'paid' })
      .get()
    if (!found.data.length) {
      return { order: null }
    }
    const doc = found.data[0]
    await db.collection('orders').doc(doc._id).update({
      data: { status: 'completed', completedAt: Date.now() }
    })
    return { order: toOrder({ ...doc, status: 'completed' }) }
  }

  if (action === 'cancel') {
    // 买家取消自己的待取件订单，成功后回补库存
    const found = await db.collection('orders')
      .where({ _id: event.id, openid: OPENID, status: 'paid' })
      .get()
    if (!found.data.length) {
      return { ok: false }
    }
    const doc = found.data[0]
    await db.collection('orders').doc(event.id).update({
      data: { status: 'cancelled', cancelledAt: Date.now() }
    })
    await restock(doc.items)
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
