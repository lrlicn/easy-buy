import { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { listGoods, findProduct, getShopConfig, findShopConfig } from '../../services/goods'
import type { Product } from '../../data/products'
import { syncTabBar } from '../../utils/tabbar'
import './index.scss'

const TAG_TEXT: Record<string, string> = { hot: '热销', new: '新品' }

export default function Index() {
  // 微信端自定义 tabBar 叠加在页面之上，底部内容需留出避让空间
  const isWeapp = process.env.TARO_ENV === 'weapp'
  const [goods, setGoods] = useState<Product[]>([])
  const [shop, setShop] = useState(findShopConfig())
  const [keyword, setKeyword] = useState('')

  // 首次进入拉取商品（云端优先，失败回退内置数据）
  useEffect(() => {
    listGoods().then(setGoods).catch(() => setGoods([]))
  }, [])

  // 首页是 tabBar 常驻页：每次切回都刷新（下单扣库存/商家改商品后回到首页能看到最新数据）
  useDidShow(() => {
    syncTabBar(0)
    listGoods().then(setGoods).catch(() => {})
    getShopConfig(true).then(setShop).catch(() => {})
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

  // 搜索：关键词匹配名称/描述（店内商品量小，前端过滤即可）
  const kw = keyword.trim().toLowerCase()
  const filtered = kw
    ? goods.filter(p => `${p.name}${p.desc}`.toLowerCase().includes(kw))
    : goods

  return (
    <View className={`page ${isWeapp ? 'page-weapp' : ''}`}>
      <View className='header'>
        <View className='shop-name'>{shop.name} · 门店自选</View>
      </View>

      {/* 搜索条 + 扫码：扫码是到店查吊牌的低频辅助入口，收进搜索条右侧（主流电商首页样式） */}
      <View className='search-bar'>
        <View className='search-icon' />
        <Input
          className='search-input'
          placeholder='搜索店内衣物'
          value={keyword}
          onInput={e => setKeyword(e.detail.value)}
        />
        {keyword && <Text className='search-clear' onClick={() => setKeyword('')}>×</Text>}
        <View className='scan-divider' />
        <View className='scan-icon' onClick={handleScan} />
      </View>

      {/* 热销推荐横滑条：搜索时隐藏，让位给搜索结果 */}
      {!kw && recList.length > 0 && (
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

      <Text className='section-title'>
        {kw ? `搜索结果 ${filtered.length} 件` : '店内所有衣物'}
      </Text>
      {/* 普通容器即可：页面整体滚动，避免 scroll-view 在微信端 flex 布局失效 */}
      {filtered.length > 0 ? (
        <View className='grid'>
          {filtered.map(p => (
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
      ) : (
        <View className='empty-search'>
          <Text>没有找到「{keyword.trim()}」相关的衣物</Text>
        </View>
      )}
    </View>
  )
}
