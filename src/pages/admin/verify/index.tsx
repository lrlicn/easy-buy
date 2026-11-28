import { useState } from 'react'
import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { listAllOrders, verifyPickup, isStaff, Order } from '../../../services/order'
import { SUBSCRIBE_TEMPLATE_ID } from '../../../config'
import { syncTabBar } from '../../../utils/tabbar'
import './index.scss'

export default function Verify() {
  // 微信端自定义 tabBar 叠加在页面之上，底部内容需留出避让空间
  const isWeapp = process.env.TARO_ENV === 'weapp'
  const [allowed, setAllowed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [lastOrder, setLastOrder] = useState<Order | null>(null) // 刚核销成功的订单（结果卡）
  const [today, setToday] = useState<Order[]>([]) // 今日已核销

  const loadToday = () =>
    listAllOrders()
      .then(list => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        setToday(list.filter(o => o.status === 'completed' && (o.completedAt || o.createdAt) >= start.getTime()))
      })
      .catch(() => {})

  useLoad(() => {
    isStaff()
      .then(ok => {
        setAllowed(ok)
        if (ok) return loadToday()
      })
      .catch(() => Taro.showToast({ title: '身份校验失败', icon: 'none' }))
      .finally(() => setChecked(true))
  })

  // 从别处回到本页时刷新今日数据（如核销成功后跳出去再回来）
  useDidShow(() => {
    syncTabBar(2)
    if (allowed) loadToday()
  })

  // 核销逻辑（手输与扫码共用）
  const doVerify = async (pickupCode: string) => {
    if (verifying) return
    setVerifying(true)
    try {
      const order = await verifyPickup(pickupCode)
      if (!order) {
        Taro.showToast({ title: '取件码无效或已核销', icon: 'none' })
      } else {
        setLastOrder(order) // 结果卡展示，替代一次性 toast
        setCode('')
        await loadToday()
      }
    } catch (e) {
      // 限流锁定/取件码无效等原因提示（云函数返回 errMsg）
      Taro.showToast({ title: (e as Error)?.message || '核销失败', icon: 'none' })
    } finally {
      setVerifying(false)
    }
  }

  // 手输核销
  const handleVerify = async () => {
    if (!code.trim()) return
    await doVerify(code.trim())
  }

  // 扫顾客出示的取件码二维码核销（高频主路径，做成大按钮）
  const handleScan = () => {
    Taro.scanCode({
      success: (res) => {
        const scanned = (res.result || '').trim()
        if (!/^\d{6}$/.test(scanned)) {
          return Taro.showToast({ title: '这不是取件码二维码', icon: 'none' })
        }
        doVerify(scanned)
      },
      fail: (res) => {
        // 用户主动取消扫码是正常操作，静默处理（框架会打印 cancel 日志，可忽略）
        const msg = res && res.errMsg ? res.errMsg : ''
        if (!msg.includes('cancel')) {
          Taro.showToast({ title: '扫码不可用，可手输取件码核销', icon: 'none' })
        }
      }
    })
  }

  // 开启新订单微信提醒（一次性订阅：每授权一次可收一条，可连点囤授权次数）
  const handleSubscribe = () => {
    if (process.env.TARO_ENV !== 'weapp') {
      return Taro.showToast({ title: '请在微信小程序中使用', icon: 'none' })
    }
    Taro.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TEMPLATE_ID],
      success: (res) => {
        if (res[SUBSCRIBE_TEMPLATE_ID] === 'accept') {
          Taro.showToast({ title: '已开启，可多点几次囤提醒', icon: 'success' })
        } else {
          Taro.showToast({ title: '已拒绝，点此可重新开启', icon: 'none' })
        }
      },
      fail: () => {
        Taro.showToast({ title: '订阅失败，请重试', icon: 'none' })
      }
    })
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // 今日统计：订单数、商品件数、核销金额
  const statQty = today.reduce((s, o) => s + o.items.reduce((q, i) => q + i.qty, 0), 0)
  const statAmount = today.reduce((s, o) => s + o.total, 0)

  if (!checked) {
    return <View className='page'><Text className='tip'>校验身份中...</Text></View>
  }

  if (!allowed) {
    return <View className='page'><Text className='tip'>无商家权限，请联系店主添加</Text></View>
  }

  return (
    <View className={`page ${isWeapp ? 'page-weapp' : ''}`}>
      {/* 主路径：扫码核销 */}
      <View className='scan-hero' onClick={handleScan}>
        <View className='hero-icon' />
        <Text className='hero-title'>{verifying ? '核销中...' : '扫描顾客取件码'}</Text>
        <Text className='hero-sub'>对准顾客「我的订单」里的取件码二维码</Text>
      </View>

      <Text className='divider'>或手动输入取件码</Text>
      <View className='manual-row'>
        <Input
          className='manual-input'
          type='number'
          maxlength={6}
          placeholder='6 位取件码'
          value={code}
          onInput={e => setCode(e.detail.value)}
        />
        <Button className={`btn-primary manual-btn ${code.trim() ? '' : 'disabled'}`} onClick={handleVerify}>
          核销
        </Button>
      </View>

      {/* 新订单微信提醒（一次性订阅，可连点囤授权） */}
      <View className='sub-entry' onClick={handleSubscribe}>
        <View className='sub-icon' />
        <View className='sub-texts'>
          <Text className='sub-title'>新订单提醒</Text>
          <Text className='sub-tip'>开启后顾客下单会微信通知；每次点击可囤 1 条提醒额度</Text>
        </View>
        <Text className='sub-arrow'>›</Text>
      </View>

      {/* 刚核销成功的订单结果卡 */}
      {lastOrder && (
        <View className='result-panel'>
          <View className='result-head'>
            <Text className='result-check'>✓</Text>
            <Text className='result-title'>核销成功</Text>
            <Text className='result-code'>{lastOrder.pickupCode}</Text>
          </View>
          {lastOrder.items.map(i => (
            <View key={i.key} className='result-row'>
              <Image className='result-img' src={i.image} mode='aspectFill' />
              <View className='result-info'>
                <Text className='result-name'>{i.name}</Text>
                <Text className='result-spec'>{i.color} / {i.size} × {i.qty}</Text>
              </View>
              <Text className='result-price'>¥{i.price * i.qty}</Text>
            </View>
          ))}
          <View className='result-total'>
            <Text>合计</Text>
            <Text className='result-amount'>¥{lastOrder.total}</Text>
          </View>
          <Button className='result-again' onClick={() => setLastOrder(null)}>继续核销下一单</Button>
        </View>
      )}

      {/* 今日已核销统计卡片 */}
      <View className='stat-card'>
        <View className='stat-head'>
          <Text className='stat-title'>今日已核销</Text>
          <Text className='stat-date'>{new Date().getMonth() + 1}月{new Date().getDate()}日</Text>
        </View>
        <View className='stat-cols'>
          <View className='stat-col'>
            <Text className='stat-num'>{today.length}</Text>
            <Text className='stat-label'>核销订单</Text>
          </View>
          <View className='stat-col'>
            <Text className='stat-num'>{statQty}</Text>
            <Text className='stat-label'>商品件数</Text>
          </View>
          <View className='stat-col'>
            <Text className='stat-num'>¥{statAmount}</Text>
            <Text className='stat-label'>核销金额</Text>
          </View>
        </View>
      </View>

      {today.length === 0 ? (
        <Text className='tip'>今天还没有核销记录</Text>
      ) : (
        <View className='panel'>
          {today.map(o => (
            <View key={o.id} className='today-row'>
              <Text className='today-time'>{formatTime(o.completedAt || o.createdAt)}</Text>
              <Text className='today-code'>{o.pickupCode}</Text>
              <Text className='today-total'>¥{o.total}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
