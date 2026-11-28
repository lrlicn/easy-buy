import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { isStaff } from '../../services/order'
import { syncTabBar } from '../../utils/tabbar'
import './index.scss'

export default function Profile() {
  const [staff, setStaff] = useState(false)

  // 自定义 tabBar 选中态同步
  useDidShow(() => syncTabBar(3))

  // 店员身份判定（无感登录，失败不阻塞页面）
  useEffect(() => {
    isStaff().then(setStaff).catch(() => {})
  }, [])

  const goOrders = () => Taro.navigateTo({ url: '/pages/orders/index' })
  const goAdmin = () => Taro.navigateTo({ url: '/pages/admin/index' })

  return (
    <View className='page'>
      <View className='user-card'>
        <View className='avatar'>客</View>
        <View className='user-info'>
          <Text className='user-name'>微信用户</Text>
          <Text className='user-tip'>登录身份由微信自动识别，无需手动登录</Text>
        </View>
      </View>

      <View className='menu'>
        <View className='menu-item' onClick={goOrders}>
          <Text className='menu-label'>我的订单</Text>
          <Text className='menu-arrow'>›</Text>
        </View>
        {staff && (
          <View className='menu-item' onClick={goAdmin}>
            <Text className='menu-label'>商家管理</Text>
            <Text className='menu-arrow'>›</Text>
          </View>
        )}
      </View>
    </View>
  )
}
