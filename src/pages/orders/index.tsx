import { useState, useEffect } from 'react'
import { View, Text, Image, Button, Canvas } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { listMyOrders, cancelOrder, deleteOrder, Order } from '../../services/order'
import { drawQr, rpxToPx } from '../../utils/qrcode'
import './index.scss'

const STATUS_TEXT: Record<Order['status'], string> = {
  paid: '待取件',
  completed: '已完成',
  cancelled: '已取消'
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [qrOrder, setQrOrder] = useState<Order | null>(null) // 弹层中出示二维码的订单

  useLoad(() => {
    listMyOrders()
      .then(setOrders)
      .catch(() => Taro.showToast({ title: '订单加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  })

  // 弹层打开后绘制取件码二维码（等 canvas 渲染完成）
  useEffect(() => {
    if (!qrOrder) return
    const timer = setTimeout(() => drawQr('qr-modal', qrOrder.pickupCode, rpxToPx(400)), 120)
    return () => clearTimeout(timer)
  }, [qrOrder])

  // 取消待取件订单（确认后执行）
  const handleCancel = (o: Order) => {
    Taro.showModal({
      title: '取消订单',
      content: `确定取消订单 ${o.pickupCode} 吗？取件码将失效。`,
      success: async (res) => {
        if (!res.confirm) return
        const ok = await cancelOrder(o.id)
        if (ok) {
          Taro.showToast({ title: '已取消', icon: 'success' })
          const next = await listMyOrders()
          setOrders(next)
        } else {
          Taro.showToast({ title: '取消失败，订单状态已变化', icon: 'none' })
        }
      }
    })
  }

  // 删除订单记录（已完成/已取消可删）
  const handleDelete = (o: Order) => {
    Taro.showModal({
      title: '删除订单',
      content: '删除后该记录将不再显示，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return
        const ok = await deleteOrder(o.id)
        if (ok) {
          setOrders(prev => prev.filter(x => x.id !== o.id))
          Taro.showToast({ title: '已删除', icon: 'success' })
        } else {
          Taro.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <View className='page'>
      {loading ? (
        <Text className='tip'>加载中...</Text>
      ) : orders.length === 0 ? (
        <Text className='tip'>还没有订单，去挑一件吧</Text>
      ) : (
        orders.map(o => (
          <View key={o.id} className='panel'>
            <View className='head'>
              <Text className='time'>{formatTime(o.createdAt)}</Text>
              <Text className={`status ${o.status !== 'paid' ? o.status === 'completed' ? 'done' : 'cancelled' : ''}`}>
                {STATUS_TEXT[o.status]}
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
              {o.status === 'paid' && (
                <View className='pickup-code'>
                  <Text className='code-label'>取件码</Text>
                  <Text className='code'>{o.pickupCode}</Text>
                </View>
              )}
            </View>
            <View className='actions'>
              {o.status === 'paid' && (
                <Button className='action-btn primary' onClick={() => setQrOrder(o)}>出示取件码</Button>
              )}
              {o.status === 'paid' && (
                <Button className='action-btn' onClick={() => handleCancel(o)}>取消订单</Button>
              )}
              {o.status !== 'paid' && (
                <Button className='action-btn' onClick={() => handleDelete(o)}>删除订单</Button>
              )}
            </View>
          </View>
        ))
      )}

      {/* 出示取件码弹层 */}
      {qrOrder && (
        <View className='qr-mask' onClick={() => setQrOrder(null)}>
          <View className='qr-modal' onClick={e => e.stopPropagation()}>
            <Text className='qm-title'>到店取件凭证</Text>
            <Canvas
              className='qm-canvas'
              id='qr-modal'
              canvasId='qr-modal'
              style={{ width: '400rpx', height: '400rpx' }}
            />
            <Text className='qm-code'>{qrOrder.pickupCode}</Text>
            <Text className='qm-tip'>向店员出示此二维码完成核销</Text>
            <Button className='qm-close' onClick={() => setQrOrder(null)}>关闭</Button>
          </View>
        </View>
      )}
    </View>
  )
}
