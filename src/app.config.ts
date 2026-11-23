export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/detail/index',
    'pages/cart/index',
    'pages/pay/index',
    'pages/orders/index',
    'pages/admin/index',
    'pages/profile/index'
  ],
  tabBar: {
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
    navigationBarTitleText: '门店扫码购',
    navigationBarTextStyle: 'white'
  }
})
