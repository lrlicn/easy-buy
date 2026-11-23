import { View, Text, Image, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCart, changeQty, removeItem, cartTotal, cartCount } from '../../store/cart'
import './index.scss'

export default function Cart() {
  const items = useCart()

  // 去结算：写入待支付订单并跳转支付页
  const checkout = () => {
    if (items.length === 0) return Taro.showToast({ title: '购物车是空的', icon: 'none' })
    Taro.setStorageSync('pendingOrder', items)
    Taro.navigateTo({ url: '/pages/pay/index' })
  }

  return (
    <View className='page'>
      {items.length === 0 ? (
        <View className='empty'>
          <Text>购物车是空的，去挑一件吧</Text>
        </View>
      ) : (
        items.map(i => (
          <View key={i.key} className='row'>
            <Image className='row-img' src={i.image} mode='aspectFill' />
            <View className='row-info'>
              <Text className='row-name'>{i.name}</Text>
              <Text className='row-spec'>{i.color} / {i.size}</Text>
              <View className='row-bottom'>
                <Text className='row-price'>¥{i.price}</Text>
                <View className='qty'>
                  <Text className='qty-btn' onClick={() => changeQty(i.key, -1)}>-</Text>
                  <Text className='qty-num'>{i.qty}</Text>
                  <Text className='qty-btn' onClick={() => changeQty(i.key, 1)}>+</Text>
                </View>
              </View>
            </View>
            <Text className='row-del' onClick={() => removeItem(i.key)}>删除</Text>
          </View>
        ))
      )}

      <View className='footer'>
        <View className='total'>
          <Text>共 {cartCount()} 件</Text>
          <Text className='total-price'>合计 ¥{cartTotal()}</Text>
        </View>
        <Button className='btn-primary checkout' onClick={checkout}>去结算</Button>
      </View>
    </View>
  )
}
