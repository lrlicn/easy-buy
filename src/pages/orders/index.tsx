import { useState, useEffect } from 'react'
import { View, Text, Image, Button, Canvas } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { listMyOrders, requestRefund, deleteOrder, Order } from '../../services/order'
import { getShopConfig, findShopConfig } from '../../services/goods'
import { drawQr, rpxToPx } from '../../utils/qrcode'
import './index.scss'

const STATUS_TEXT: Record<Order['status'], string> = {
  paid: '待取件',
  refund_requested: '退款申请中',
  refunded: '已退款',
  completed: '已完成',
  cancelled: '已取消'
}

// 状态文字配色 class（详见 index.scss .status）
const STATUS_CLASS: Record<Order['status'], string> = {
  paid: '',
  refund_requested: 'refunding',
  refunded: 'done',
  completed: 'done',
  cancelled: 'cancelled'
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [qrOrder, setQrOrder] = useState<Order | null>(null) // 弹层中出示二维码的订单
  const [shop, setShop] = useState(findShopConfig())

  // 每次页面显示时都刷新（含首次）：商家核销/顾客取消后状态在云端变化，
  // 顾客的订单页若只在前次加载时拉取，会一直停留在旧状态
  useDidShow(() => {
    listMyOrders()
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false))
    getShopConfig().then(setShop).catch(() => {})
  })

  // 弹层打开后绘制取件码二维码（等 canvas 渲染完成）
  useEffect(() => {
    if (!qrOrder) return
    const timer = setTimeout(() => drawQr('qr-modal', qrOrder.pickupCode, rpxToPx(400)), 120)
    return () => clearTimeout(timer)
  }, [qrOrder])

  // 下拉手动刷新（页面停留期间商家核销后，顾客下拉即可看到最新状态）
  usePullDownRefresh(() => {
    listMyOrders()
      .then(setOrders)
      .catch(() => {})
      .finally(() => Taro.stopPullDownRefresh())
  })

  // 已付款订单申请退款（付款后取消需商家审核；同意后退款并回补库存）
  const handleRefundRequest = (o: Order) => {
    Taro.showModal({
      title: '申请退款',
      content: `申请取消订单 ${o.pickupCode} 并退款？需商家审核确认。`,
      success: async (res) => {
        if (!res.confirm) return
        const ok = await requestRefund(o.id)
        if (ok) {
          Taro.showToast({ title: '已提交申请', icon: 'success' })
          const next = await listMyOrders()
          setOrders(next)
        } else {
          Taro.showToast({ title: '提交失败，订单状态已变化', icon: 'none' })
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
              <Text className={`status ${STATUS_CLASS[o.status]}`}>
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
                <Button className='action-btn' onClick={() => handleRefundRequest(o)}>申请退款</Button>
              )}
              {o.status === 'refund_requested' && (
                <Text className='refund-waiting'>已提交申请，等待商家处理</Text>
              )}
              {(o.status === 'completed' || o.status === 'cancelled' || o.status === 'refunded') && (
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
            {shop.address && <Text className='qm-shop'>门店地址：{shop.name} · {shop.address}</Text>}
            <Button className='qm-close' onClick={() => setQrOrder(null)}>关闭</Button>
          </View>
        </View>
      )}
    </View>
  )
}
