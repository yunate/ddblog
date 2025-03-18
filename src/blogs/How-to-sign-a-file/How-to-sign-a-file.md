---
title: '如何为一个文件签名'
pubDate: 2025-06-12
author: 'yunate'
tags: [
  "签名", "证书", "TLS"
]
---
### 为什么要对一个文件签名?
为了验证文件的完整性, 一旦文件内容发生任何变化签名验证都会失败 所以文件一旦改动就必须使用证书重新签名, 这样攻击者如果对文件进行了修改, 但是他又没有原始证书, 这样我们就知道这个文件被篡改过了


### 如何签名
1. 首先需要准备一个证书: [如何制作一个自签名证书(根证书)](/posts/self-signed-certificate/self-signed-certificate/)
2. 以管理员权限打开CMD, 运行以下命令:

```bat
"signtool.exe" sign /f "你的证书.pfx" /p 证书密码 /fd sha256 /tr http://timestamp.digicert.com /td sha256 "你的文件"
```

- signtool.exe 是微软提供的工具, 一般你的电脑里面会有, 使用everything搜索一下, 如果没有的话可以在网络下载
- 命令中的路径最好使用双引号引起来, 不如如果路径中有空格会失败
