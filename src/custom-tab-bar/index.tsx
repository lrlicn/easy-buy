// 自定义 tabBar：顾客 3 个标签（首页/购物车/我的），店员额外显示"核销"
// 原生 tabBar 无法按角色动态增减，微信端改用 custom-tab-bar（app.config 中 custom: true）
// 每个 tab 页持有独立的 tabBar 实例，页面 useDidShow 时通过 setSelected 同步选中态
import { View, Image, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Component } from 'react'
import { isStaff } from '../services/order'
// 样式见同目录 index.wxss（Taro 不会为 custom-tab-bar 生成 wxss，由构建配置 copy 直通）

interface TabItem {
  path: string
  text: string
  icon: string
  activeIcon: string
  staffOnly?: boolean
}

const TABS: TabItem[] = [
  { path: '/pages/index/index', text: '首页', icon: '../assets/tabbar/home.png', activeIcon: '../assets/tabbar/home-active.png' },
  { path: '/pages/cart/index', text: '购物车', icon: '../assets/tabbar/cart.png', activeIcon: '../assets/tabbar/cart-active.png' },
  { path: '/pages/admin/verify/index', text: '核销', icon: '../assets/tabbar/scan.png', activeIcon: '../assets/tabbar/scan-active.png', staffOnly: true },
  { path: '/pages/profile/index', text: '我的', icon: '../assets/tabbar/profile.png', activeIcon: '../assets/tabbar/profile-active.png' }
]

// 店员判定结果跨页面缓存（各页 tabBar 实例共用，避免重复请求）
let staffCache: boolean | null = null

interface State {
  selected: number
  staff: boolean
}

export default class CustomTabBar extends Component<Record<string, never>, State> {
  state: State = { selected: 0, staff: staffCache === true }

  componentDidMount() {
    if (staffCache !== null) return
    isStaff()
      .then(ok => {
        staffCache = ok
        this.setState({ staff: ok })
      })
      .catch(() => {})
  }

  // 供 tab 页在 useDidShow 中调用，同步当前选中项
  setSelected = (idx: number) => this.setState({ selected: idx })

  handleTap = (item: TabItem, idx: number) => {
    if (this.state.selected === idx) return
    this.setState({ selected: idx })
    Taro.switchTab({ url: item.path })
  }

  render() {
    const { selected, staff } = this.state
    const visible = TABS.filter(t => !t.staffOnly || staff)
    return (
      <View className='ctab'>
        {visible.map(t => {
          const idx = TABS.indexOf(t)
          const active = selected === idx
          return (
            <View key={t.path} className='ctab-item' onClick={() => this.handleTap(t, idx)}>
              <Image className='ctab-icon' src={active ? t.activeIcon : t.icon} />
              <Text className={`ctab-text ${active ? 'active' : ''}`}>{t.text}</Text>
            </View>
          )
        })}
      </View>
    )
  }
}
