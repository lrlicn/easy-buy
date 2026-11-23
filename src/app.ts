import { PropsWithChildren } from 'react'
import Taro from '@tarojs/taro'
import { useLaunch } from '@tarojs/taro'
import { CLOUD_ENV_ID } from './config'

import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
    // 微信端且已配置云环境时初始化云开发；否则服务层自动走 mock
    if (process.env.TARO_ENV === 'weapp' && CLOUD_ENV_ID && (Taro as any).cloud) {
      ;(Taro as any).cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    }
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
