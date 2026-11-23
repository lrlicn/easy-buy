import { useState } from 'react'
import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { getProduct } from '../../data/products'
import { addToCart, useCart } from '../../store/cart'
import './index.scss'

export default function Detail() {
  const [qty, setQty] = useState(1)
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const product = getProduct(Taro.getCurrentInstance().router?.params?.id)
  const cartItems = useCart()
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)

  useLoad(() => {
    // 默认选中第一个规格
    if (product) {
      setColor(product.colors[0])
      setSize(product.sizes[0])
    }
  })

  if (!product) {
    return <View className='page'><Text className='empty'>商品不存在</Text></View>
  }

  const specReady = color && size
  const key = `${product.id}-${color}-${size}`

  // 加入购物车
  const handleAdd = () => {
    if (!specReady) return Taro.showToast({ title: '请选择颜色和尺码', icon: 'none' })
    addToCart({
      key,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      color,
      size
    }, qty)
    Taro.showToast({ title: '已加入购物车', icon: 'success' })
  }

  // 立即购买：写入待支付订单并跳转支付页
  const handleBuyNow = () => {
    if (!specReady) return Taro.showToast({ title: '请选择颜色和尺码', icon: 'none' })
    Taro.setStorageSync('pendingOrder', [{
      key,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      color,
      size,
      qty
    }])
    Taro.navigateTo({ url: '/pages/pay/index' })
  }

  // 跳转购物车
  // 购物车是 tabBar 页面，必须用 switchTab
  const goCart = () => Taro.switchTab({ url: '/pages/cart/index' })

  return (
    <View className='page'>
      <Image className='hero' src={product.image} mode='aspectFill' />
      <View className='info'>
        <Text className='name'>{product.name}</Text>
        <Text className='price'>¥{product.price}</Text>
        <Text className='desc'>{product.desc}</Text>
      </View>

      <View className='spec'>
        <Text className='spec-label'>颜色</Text>
        <View className='options'>
          {product.colors.map(c => (
            <Text key={c} className={`opt ${color === c ? 'active' : ''}`} onClick={() => setColor(c)}>{c}</Text>
          ))}
        </View>
        <Text className='spec-label'>尺码</Text>
        <View className='options'>
          {product.sizes.map(s => (
            <Text key={s} className={`opt ${size === s ? 'active' : ''}`} onClick={() => setSize(s)}>{s}</Text>
          ))}
        </View>
        <Text className='spec-label'>数量</Text>
        <View className='qty'>
          <Text className='qty-btn' onClick={() => setQty(q => Math.max(1, q - 1))}>-</Text>
          <Text className='qty-num'>{qty}</Text>
          <Text className='qty-btn' onClick={() => setQty(q => q + 1)}>+</Text>
        </View>
      </View>

      <View className='footer'>
        <View className='cart-entry' onClick={goCart}>
          {cartCount > 0 && <Text className='cart-badge'>{cartCount}</Text>}
        </View>
        <Button className='btn-cart' onClick={handleAdd}>加入购物车</Button>
        <Button className='btn-buy' onClick={handleBuyNow}>立即购买</Button>
      </View>
    </View>
  )
}
