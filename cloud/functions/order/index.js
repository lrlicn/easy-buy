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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, items, total, pickupCode } = event

  // 控制台「测试」没有微信用户上下文（OPENID 为空），直接给友好提示，避免堆栈报错
  if (!OPENID) {
    return { code: 'NO_USER_CONTEXT', errMsg: '控制台测试无用户身份，请从小程序端真实调用验证' }
  }

  if (action === 'create') {
    const order = {
      openid: OPENID,
      items,
      total,
      pickupCode: String(Math.floor(100000 + Math.random() * 900000)),
      status: 'paid',
      createdAt: Date.now()
    }
    const res = await db.collection('orders').add({ data: order })
    return { order: toOrder({ ...order, _id: res._id }) }
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
    // 买家取消自己的待取件订单
    const found = await db.collection('orders')
      .where({ _id: event.id, openid: OPENID, status: 'paid' })
      .get()
    if (!found.data.length) {
      return { ok: false }
    }
    await db.collection('orders').doc(event.id).update({
      data: { status: 'cancelled', cancelledAt: Date.now() }
    })
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
