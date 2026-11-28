import { View, Text, Image, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useCart, changeQty, removeItem, cartCount } from '../../store/cart'
import { syncTabBar } from '../../utils/tabbar'
import './index.scss'

export default function Cart() {
  const items = useCart()
  // 微信端自定义 tabBar 覆盖在页面之上，固定底元素需抬高避让（H5 用 --window-bottom 即可）
  const isWeapp = process.env.TARO_ENV === 'weapp'
  // 已勾选结算的行 key 集合（仅页面内存，进入购物车默认全选）
  const [selected, setSelected] = useState<string[] | null>(null)

  // selected 为 null 表示尚未初始化：默认全选
  const keys = items.map(i => i.key)
  const selectedKeys =
    selected === null ? keys : selected.filter(k => keys.includes(k))
  const selectedItems = items.filter(i => selectedKeys.includes(i.key))
  const allSelected = keys.length > 0 && selectedKeys.length === keys.length

  // 自定义 tabBar 选中态同步
  useDidShow(() => syncTabBar(1))

  // 同步勾选状态（null 时展开为全选）
  const setSelectedKeys = (next: string[]) => setSelected(next)

  const toggleItem = (key: string) => {
    setSelectedKeys(
      selectedKeys.includes(key)
        ? selectedKeys.filter(k => k !== key)
        : [...selectedKeys, key]
    )
  }

  const toggleAll = () => {
    setSelectedKeys(allSelected ? [] : keys)
  }

  // 只结算已勾选的商品
  const checkout = () => {
    if (selectedItems.length === 0)
      return Taro.showToast({ title: '请先选择商品', icon: 'none' })
    Taro.setStorageSync('pendingOrder', selectedItems)
    Taro.navigateTo({ url: '/pages/pay/index' })
  }

  // 已选件数与合计
  const selectedCount = selectedItems.reduce((s, i) => s + i.qty, 0)
  const selectedTotal = selectedItems
    .reduce((s, i) => s + i.price * i.qty, 0)
    .toFixed(2)

  return (
    <View className={`page ${isWeapp ? 'page-weapp' : ''}`}>
      {items.length === 0 ? (
        <View className='empty'>
          <Text>购物车是空的，去挑一件吧</Text>
        </View>
      ) : (
        items.map(i => (
          <View key={i.key} className='row'>
            {/* 勾选框 */}
            <View
              className={`check ${selectedKeys.includes(i.key) ? 'checked' : ''}`}
              onClick={() => toggleItem(i.key)}
            >
              {selectedKeys.includes(i.key) && <Text className='check-mark'>✓</Text>}
            </View>
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
        {/* 全选 */}
        {items.length > 0 && (
          <View className='select-all' onClick={toggleAll}>
            <View className={`check ${allSelected ? 'checked' : ''}`}>
              {allSelected && <Text className='check-mark'>✓</Text>}
            </View>
            <Text>全选</Text>
          </View>
        )}
        <View className='total'>
          <Text className='total-label'>合计</Text>
          <Text className='total-price'>¥{selectedTotal}</Text>
        </View>
        <Button
          className={`btn-primary checkout ${selectedItems.length === 0 ? 'disabled' : ''}`}
          onClick={checkout}
        >
          去结算{selectedItems.length > 0 ? `(${selectedCount})` : ''}
        </Button>
      </View>
    </View>
  )
}
