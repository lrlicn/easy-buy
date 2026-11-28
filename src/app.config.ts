// 自定义 tabBar 仅微信端启用：店员可见"核销"标签（顾客隐藏）
// H5 端不支持 custom-tab-bar，仍用原生渲染（列表含核销，开发预览用）
const isWeapp = process.env.TARO_ENV === 'weapp'

export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/detail/index',
    'pages/cart/index',
    'pages/pay/index',
    'pages/orders/index',
    'pages/admin/index',
    'pages/admin/verify/index',
    'pages/profile/index'
  ],
  tabBar: {
    custom: isWeapp,
    color: '#999999',
    selectedColor: '#1a1a1a',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png'
      },
      {
        pagePath: 'pages/cart/index',
        text: '购物车',
        iconPath: 'assets/tabbar/cart.png',
        selectedIconPath: 'assets/tabbar/cart-active.png'
      },
      {
        pagePath: 'pages/admin/verify/index',
        text: '核销',
        iconPath: 'assets/tabbar/scan.png',
        selectedIconPath: 'assets/tabbar/scan-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tabbar/profile.png',
        selectedIconPath: 'assets/tabbar/profile-active.png'
      }
    ]
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1a1a1a',
    navigationBarTitleText: '衣码购',
    navigationBarTextStyle: 'white'
  }
})
