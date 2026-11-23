// 登录云函数：返回调用者 openid，并判定是否为店员（staff 集合白名单）
// 首次调用时自动创建 orders / staff 集合，免去控制台手动建表
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 确保集合存在（已存在时 createCollection 会抛错，捕获即可）
async function ensureCollection(name) {
  try {
    await cloud.database().createCollection(name)
  } catch (e) {
    // 集合已存在或无权限时静默跳过
  }
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  await ensureCollection('orders')
  await ensureCollection('staff')
  // 控制台「测试」没有微信用户上下文，OPENID 为空；真实调用必有身份
  if (!OPENID) {
    return { openid: '', isStaff: false, notice: '无用户身份（控制台测试属于这种情况）' }
  }
  const db = cloud.database()
  const staffRes = await db.collection('staff').where({ openid: OPENID }).count()
  return { openid: OPENID, isStaff: staffRes.total > 0 }
}
