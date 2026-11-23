import { useState } from 'react'
import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { clearCart, CartItem } from '../../store/cart'
import { createOrder } from '../../services/order'
import './index.scss'

export default function Pay() {
  const [order, setOrder] = useState<CartItem[]>([])
  const [paid, setPaid] = useState(false)
  const [paying, setPaying] = useState(false)
  const [pickupCode, setPickupCode] = useState('')

  useLoad(() => {
    setOrder(Taro.getStorageSync('pendingOrder') || [])
  })

  const total = order.reduce((s, i) => s + i.price * i.qty, 0)

  // 支付：真实环境需后端创建订单后调用 Taro.requestPayment 拉起微信支付，
  // 此处为演示流程，模拟支付耗时；支付成功后订单落库并生成取件码
  const handlePay = async () => {
    if (paying || order.length === 0) return
    setPaying(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1200))
      const created = await createOrder(order, total)
      setPickupCode(created.pickupCode)
      setPaid(true)
      clearCart() // 支付成功后清空购物车
      Taro.removeStorageSync('pendingOrder')
    } catch (e) {
      Taro.showToast({ title: '订单创建失败，请重试', icon: 'none' })
    } finally {
      setPaying(false)
    }
  }

  const backHome = () => Taro.reLaunch({ url: '/pages/index/index' })
  const goOrders = () => Taro.navigateTo({ url: '/pages/orders/index' })

  if (paid) {
    return (
      <View className='page center'>
        <View className='success-icon'>✓</View>
        <Text className='success-title'>支付成功</Text>
        <View className='pickup-tip'>
          <Text className='pickup-label'>取件码</Text>
          <Text className='pickup-code'>{pickupCode}</Text>
        </View>
        <Text className='success-tip'>请凭取件码到门店柜台取货</Text>
        <Button className='btn-primary home-btn' onClick={backHome}>返回首页</Button>
        <Button className='orders-btn' onClick={goOrders}>查看我的订单</Button>
      </View>
    )
  }

  return (
    <View className='page'>
      <View className='panel'>
        <View className='pickup'>门店自提 · 衣间（XX路店）</View>
        {order.map(i => (
          <View key={i.key} className='row'>
            <Image className='row-img' src={i.image} mode='aspectFill' />
            <View className='row-info'>
              <Text className='row-name'>{i.name}</Text>
              <Text className='row-spec'>{i.color} / {i.size} × {i.qty}</Text>
            </View>
            <Text className='row-price'>¥{i.price * i.qty}</Text>
          </View>
        ))}
      </View>

      <View className='panel total-row'>
        <Text>应付金额</Text>
        <Text className='total'>¥{total}</Text>
      </View>

      <Button
        className={`btn-primary pay-btn ${order.length === 0 ? 'disabled' : ''}`}
        onClick={handlePay}
      >
        {paying ? '支付中...' : `确认支付 ¥${total}`}
      </Button>
    </View>
  )
}
