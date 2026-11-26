import { useState, useEffect } from 'react'
import { View, Text, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getProductById, getShopConfig, findShopConfig } from '../../services/goods'
import type { Product } from '../../data/products'
import { addToCart, useCart } from '../../store/cart'
import './index.scss'

export default function Detail() {
  // 商品 id 只在挂载时取一次：
  // getCurrentInstance 返回的是"当前栈顶页面"的路由，在渲染期调用时，本页退到后台
  // （如支付页更新购物车触发本页重渲染）会拿到别的页面的 params，导致 id 漂移、商品被误清空
  const [id] = useState(() => Taro.getCurrentInstance().router?.params?.id)
  // null = 加载中；undefined = 确认不存在
  const [product, setProduct] = useState<Product | null | undefined>(null)
  const [qty, setQty] = useState(1)
  const [color, setColor] = useState('')
  const [size, setSize] = useState('')
  const cartItems = useCart()
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)
  const [shop, setShop] = useState(findShopConfig())

  // 商品异步加载：缓存未命中时会强制拉取云端（扫码冷启动场景）
  useEffect(() => {
    let alive = true
    getProductById(id).then(p => {
      if (alive) setProduct(p ?? undefined)
    })
    getShopConfig().then(s => {
      if (alive) setShop(s)
    })
    return () => {
      alive = false
    }
  }, [id])

  // 商品就绪后默认选中第一个规格
  useEffect(() => {
    if (product) {
      setColor(product.colors[0] || '')
      setSize(product.sizes[0] || '')
    }
  }, [product])

  if (product === null) {
    return <View className='page'><Text className='empty'>加载中...</Text></View>
  }

  if (!product) {
    return <View className='page'><Text className='empty'>商品不存在</Text></View>
  }

  const specReady = color && size
  const key = `${product.id}-${color}-${size}`
  // 价格排版：整数特大、小数缩小（京东同款层级）
  const [priceInt, priceDec] = product.price.toFixed(2).split('.')
  // 当前所选规格的库存：-1/缺省 = 不限；旧数据无 stocks 字段视为不限
  const stockRaw = product.stocks ? product.stocks[`${color}-${size}`] : undefined
  const stock = stockRaw === undefined ? -1 : stockRaw
  const stockUnlimited = stock === -1 || stock === undefined
  const stockOut = specReady && !stockUnlimited && stock <= 0

  // 数量上限受库存约束
  const maxQty = stockUnlimited ? 99 : Math.max(1, stock)
  const changeQty = (delta: number) =>
    setQty(q => Math.min(maxQty, Math.max(1, q + delta)))

  // 加入购物车
  const handleAdd = () => {
    if (stockOut) return Taro.showToast({ title: '该规格已售罄', icon: 'none' })
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
    if (stockOut) return Taro.showToast({ title: '该规格已售罄', icon: 'none' })
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
        <View className='price-row'>
          <Text className='price-symbol'>¥</Text>
          <Text className='price-int'>{priceInt}</Text>
          <Text className='price-dec'>.{priceDec}</Text>
        </View>
        <Text className='name'>{product.name}</Text>
        <Text className='desc'>{product.desc}</Text>
        {/* 服务保障行：讲清自提流程（对应京东"自营品质"信任区） */}
        <View className='service-row'>
          <Text className='service-tag'>门店自提</Text>
          <Text className='service-text'>{shop.notice || '支付后凭取件码到店取货，免运费'}</Text>
        </View>
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
        <View className='qty-row'>
          <Text className='spec-label'>数量</Text>
          {specReady && (
            <Text className={`stock-hint ${stockOut ? 'out' : stockUnlimited ? '' : 'low'}`}>
              {stockOut ? '该规格已售罄' : stockUnlimited ? '库存充足' : `仅剩 ${stock} 件`}
            </Text>
          )}
        </View>
        <View className='qty'>
          <Text className='qty-btn' onClick={() => changeQty(-1)}>-</Text>
          <Text className='qty-num'>{qty}</Text>
          <Text className='qty-btn' onClick={() => changeQty(1)}>+</Text>
        </View>
      </View>

      <View className='footer'>
        <View className='cart-entry' onClick={goCart}>
          <View className='cart-icon'>
            {cartCount > 0 && <Text className='cart-badge'>{cartCount}</Text>}
          </View>
          <Text className='cart-label'>购物车</Text>
        </View>
        <View className='buy-pill'>
          <Button className={`btn-cart ${stockOut ? 'disabled' : ''}`} onClick={handleAdd}>加入购物车</Button>
          <Button className={`btn-buy ${stockOut ? 'disabled' : ''}`} onClick={handleBuyNow}>立即购买</Button>
        </View>
      </View>
    </View>
  )
}
