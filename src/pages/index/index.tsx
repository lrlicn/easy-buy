import { useState, useEffect } from 'react'
import { View, Text, Image, Button, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { listGoods, findProduct } from '../../services/goods'
import type { Product } from '../../data/products'
import './index.scss'

const TAG_TEXT: Record<string, string> = { hot: '热销', new: '新品' }

export default function Index() {
  const [goods, setGoods] = useState<Product[]>([])

  // 首次进入拉取商品（云端优先，失败回退内置数据）
  useEffect(() => {
    listGoods().then(setGoods).catch(() => setGoods([]))
  }, [])

  // 首页是 tabBar 常驻页：每次切回都刷新（下单扣库存/商家改商品后回到首页能看到最新数据）
  useDidShow(() => {
    listGoods().then(setGoods).catch(() => {})
  })

  // 推荐条：优先显示打了运营标签的商品，没有标签则取前 4 件
  const recommend = goods.filter(p => p.tag)
  const recList = recommend.length > 0 ? recommend : goods.slice(0, 4)

  // 线下扫码：二维码内容为商品 id 或含 /p/{id} 的链接
  const handleScan = () => {
    Taro.scanCode({
      success: (res) => {
        const raw: string = res.result || ''
        const match = raw.match(/p\/(\w+)/)
        const id = match ? match[1] : raw.trim()
        const target = findProduct(id)
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

  return (
    <View className='page'>
      <View className='header'>
        <View className='shop-name'>衣间 · 门店自选</View>
        <View className='scan-entry' onClick={handleScan} />
      </View>

      <View className='scan-card'>
        <Text className='scan-title'>扫一扫，开始挑选</Text>
        <Text className='scan-tip'>扫描衣物吊牌上的二维码，查看详情并下单</Text>
        <Button className='scan-btn' onClick={handleScan}>扫码选衣</Button>
      </View>

      {/* 热销推荐横滑条（小黄车式紧凑卡片） */}
      {recList.length > 0 && (
        <View>
          <Text className='section-title'>热销推荐</Text>
          <ScrollView className='rec-scroll' scrollX enhanced showScrollbar={false}>
            <View className='rec-strip'>
              {recList.map(p => (
                <View key={p.id} className='rec-card' onClick={() => goDetail(p.id)}>
                  <View className='rec-img-wrap'>
                    <Image className='rec-img' src={p.image} mode='aspectFill' />
                    {p.tag && <Text className={`badge ${p.tag}`}>{TAG_TEXT[p.tag]}</Text>}
                  </View>
                  <Text className='rec-name'>{p.name}</Text>
                  <Text className='rec-price'>¥{p.price}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      <View className='section-title'>店内所有衣物</View>
      {/* 普通容器即可：页面整体滚动，避免 scroll-view 在微信端 flex 布局失效 */}
      <View className='grid'>
        {goods.map(p => (
          <View key={p.id} className='card' onClick={() => goDetail(p.id)}>
            <View className='card-img-wrap'>
              <Image className='card-img' src={p.image} mode='aspectFill' />
              {p.tag && <Text className={`badge ${p.tag}`}>{TAG_TEXT[p.tag]}</Text>}
            </View>
            <View className='card-info'>
              <Text className='card-name'>{p.name}</Text>
              <Text className='card-price'>¥{p.price}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}
