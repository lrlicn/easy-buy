import { View, Text, Image, Button, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { products } from '../../data/products'
import { useCart } from '../../store/cart'
import './index.scss'

export default function Index() {
  const cart = useCart()
  // 线下扫码：二维码内容为商品 id 或含 /p/{id} 的链接
  const handleScan = () => {
    Taro.scanCode({
      success: (res) => {
        const raw: string = res.result || ''
        const match = raw.match(/p\/(\w+)/)
        const id = match ? match[1] : raw.trim()
        const target = products.find(p => p.id === id)
        if (target) {
          Taro.navigateTo({ url: `/pages/detail/index?id=${target.id}` })
        } else {
          Taro.showToast({ title: '未识别到商品', icon: 'none' })
        }
      },
      fail: () => {
        // H5 预览环境无扫码能力
        Taro.showToast({ title: '请使用微信/支付宝扫一扫', icon: 'none' })
      }
    })
  }

  const goDetail = (id: string) => Taro.navigateTo({ url: `/pages/detail/index?id=${id}` })
  const goCart = () => Taro.navigateTo({ url: '/pages/cart/index' })

  return (
    <View className='page'>
      <View className='header'>
        <View className='shop-name'>衣间 · 门店自选</View>
        <View className='cart-entry' onClick={goCart}>
          购物车{cart.length > 0 ? `(${cart.reduce((s, i) => s + i.qty, 0)})` : ''}
        </View>
      </View>

      <View className='scan-card'>
        <Text className='scan-title'>扫一扫，开始挑选</Text>
        <Text className='scan-tip'>扫描衣物吊牌上的二维码，查看详情并下单</Text>
        <Button className='scan-btn' onClick={handleScan}>扫码选衣</Button>
      </View>

      <View className='section-title'>店内所有衣物</View>
      <ScrollView scrollY className='grid'>
        {products.map(p => (
          <View key={p.id} className='card' onClick={() => goDetail(p.id)}>
            <Image className='card-img' src={p.image} mode='aspectFill' />
            <View className='card-info'>
              <Text className='card-name'>{p.name}</Text>
              <Text className='card-price'>¥{p.price}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
