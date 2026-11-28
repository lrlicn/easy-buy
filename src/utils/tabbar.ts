// tab 页与自定义 tabBar 的选中态同步
// 每个 tab 页持有独立的 tabBar 实例，页面显示时把当前索引写进去（微信端 custom tabBar 场景）
import Taro, { getCurrentInstance } from '@tarojs/taro'

export function syncTabBar(idx: number): void {
  const page = getCurrentInstance().page
  const tabBar = (Taro as any).getTabBar?.(page)
  tabBar?.setSelected?.(idx)
}
