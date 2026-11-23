import { useState } from 'react'
import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { listAllOrders, verifyPickup, isStaff, Order } from '../../services/order'
import './index.scss'

export default function Admin() {
  const [orders, setOrders] = useState<Order[]>([])
  const [allowed, setAllowed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  useLoad(() => {
    isStaff()
      .then(ok => {
        setAllowed(ok)
        if (ok) return loadOrders()
      })
      .catch(() => Taro.showToast({ title: '身份校验失败', icon: 'none' }))
      .finally(() => setChecked(true))
  })

  const loadOrders = () =>
    listAllOrders()
      .then(setOrders)
      .catch(() => Taro.showToast({ title: '订单加载失败', icon: 'none' }))

  // 核销逻辑（手输与扫码共用）
  const doVerify = async (pickupCode: string) => {
    if (verifying) return
    setVerifying(true)
    try {
      const order = await verifyPickup(pickupCode)
      if (!order) {
        Taro.showToast({ title: '取件码无效或已核销', icon: 'none' })
      } else {
        Taro.showToast({ title: '核销成功', icon: 'success' })
        setCode('')
        await loadOrders()
      }
    } finally {
      setVerifying(false)
    }
  }

  // 按取件码核销（手输）
  const handleVerify = async () => {
    if (!code.trim()) return
    await doVerify(code.trim())
  }

  // 扫顾客出示的取件码二维码核销
  const handleScanVerify = () => {
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

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  if (!checked) {
    return <View className='page'><Text className='tip'>校验身份中...</Text></View>
  }

  if (!allowed) {
    return <View className='page'><Text className='tip'>无商家权限，请联系店主在 staff 集合中添加你的 openid</Text></View>
  }

  return (
    <View className='page'>
      <View className='panel verify-panel'>
        <Text className='verify-title'>取件核销</Text>
        <View className='verify-row'>
          <Input
            className='verify-input'
            type='number'
            maxlength={6}
            placeholder='输入买家 6 位取件码'
            value={code}
            onInput={e => setCode(e.detail.value)}
          />
          <Button className={`btn-primary verify-btn ${code.trim() ? '' : 'disabled'}`} onClick={handleVerify}>
            {verifying ? '核销中...' : '核销'}
          </Button>
        </View>
        <View className='scan-entry' onClick={handleScanVerify}>
          <View className='scan-icon' />
          <View className='scan-texts'>
            <Text className='scan-title'>扫码核销</Text>
            <Text className='scan-sub'>对准顾客「我的订单」里的取件码二维码</Text>
          </View>
          <Text className='scan-arrow'>›</Text>
        </View>
      </View>

      <Text className='section-title'>全部订单</Text>
      {orders.length === 0 ? (
        <Text className='tip'>暂无订单</Text>
      ) : (
        orders.map(o => (
          <View key={o.id} className='panel'>
            <View className='head'>
              <View className='head-left'>
                <Text className='time'>{formatTime(o.createdAt)}</Text>
                {/* openid 后 6 位标识顾客；真实模式可再叠加昵称/手机号 */}
                <Text className='customer'>顾客 {o.openid.slice(-6)}</Text>
              </View>
              <Text className={`status ${o.status !== 'paid' ? o.status === 'completed' ? 'done' : 'cancelled' : ''}`}>
                {o.status === 'completed' ? '已完成' : o.status === 'cancelled' ? '已取消' : '待取件'}
              </Text>
            </View>
            {o.items.map(i => (
              <View key={i.key} className='row'>
                <Image className='row-img' src={i.image} mode='aspectFill' />
                <View className='row-info'>
                  <Text className='row-name'>{i.name}</Text>
                  <Text className='row-spec'>{i.color} / {i.size} × {i.qty}</Text>
                </View>
                <Text className='row-price'>¥{i.price * i.qty}</Text>
              </View>
            ))}
            <View className='foot'>
              <Text className='total'>合计 ¥{o.total}</Text>
              <Text className='code'>取件码 {o.pickupCode}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}
