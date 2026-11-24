// 商品云函数：list 全量商品（公开）/ save 新增或保存（店员）/ remove 删除（店员）/ seed 导入示例商品（店员）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertStaff(openid) {
  const res = await db.collection('staff').where({ openid }).count()
  if (res.total === 0) {
    throw new Error('无商家权限')
  }
}

// goods 集合不存在时自动创建；已存在（ALREADY_EXISTS 等报错）一律忽略——
// 真正的失败会在后续读写时以更明确的错误暴露，不会在这里被掩盖
async function ensureGoodsCollection() {
  try {
    await db.createCollection('goods')
  } catch (e) {
    console.log('ensureGoodsCollection:', e.errCode || e.errMsg || e.message)
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, product, list } = event

  await ensureGoodsCollection()

  // 商品列表是公开数据，无需登录身份（按创建时间倒序，顺序稳定）
  if (action === 'list') {
    const res = await db.collection('goods').orderBy('createdAt', 'desc').limit(100).get()
    // 剥掉 _id 换成 id，避免下游把 _id 原样传回导致 set 失败
    return {
      list: res.data.map((d) => {
        const { _id, ...rest } = d
        return { ...rest, id: _id }
      })
    }
  }

  // 控制台「测试」没有微信用户上下文，给友好提示
  if (!OPENID) {
    return { code: 'NO_USER_CONTEXT', errMsg: '控制台测试无用户身份，请从小程序端真实调用验证' }
  }

  if (action === 'save') {
    await assertStaff(OPENID)
    const { id, ...data } = { ...product }
    delete data._id // 数据库主键不允许写入
    data.updatedAt = Date.now()
    if (!data.createdAt) data.createdAt = data.updatedAt // 编辑时沿用原创建时间
    // doc().set：不存在则创建，存在则整体替换（新增与编辑共用）
    await db.collection('goods').doc(id).set({ data })
    return { ok: true, id }
  }

  if (action === 'seed') {
    await assertStaff(OPENID)
    for (const p of list) {
      const data = { ...p }
      const id = data.id
      delete data.id
      delete data._id
      data.createdAt = Date.now()
      data.updatedAt = data.createdAt
      await db.collection('goods').doc(id).set({ data })
    }
    return { ok: true, count: list.length }
  }

  if (action === 'remove') {
    await assertStaff(OPENID)
    await db.collection('goods').doc(event.id).remove()
    return { ok: true }
  }

  throw new Error('未知 action: ' + action)
}
