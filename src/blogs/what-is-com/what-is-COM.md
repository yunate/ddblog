---
title: '什么是COM?'
pubDate: 2025-06-07
author: 'yunate'
tags: [
  "COM","Windows"
]
---
### 什么是COM?
COM 可以简单理解为一个clsid(例如`{CED40584-ADF4-4CEF-A168-42AF852BB5C4}`), 这个clsid和一个dll绑定, 绑定信息记录在注册表中: `clsid <--> dll path`, 这样client代码可以通过这个clsid来调用这个dll的接口.
一个dll可以和多个clsid绑定. 但一个clsid对应一个dll.

### 如何开发一个COM?
想要开发一个COM应该创建一个dll, 并导出如下接口:
```
DllRegisterServer
DllGetClassObject
DllCanUnloadNow
DllUnregisterServer
```

**DllRegisterServer**
该函数会被`regsvr32.exe`工具调用(`regsvr32.exe example_dom.dll`). COM 作者应该在`DllRegisterServer`函数中写注册表将该dll的路径和clsid绑定, 也可以使用ATL的工具函数`_AtlModule.RegisterServer(TRUE);`. 需要注意的是一个dll可以绑定多个clsid, 换句话说一个dll中可以包含多个COM.

*需要说明的是, 我们也可以不导出该函数, 而是使用代码将该dll路径和clsid绑定并写入注册表, 这一样可以完成注册, 只是这不是标准做法.*

**DllUnregisterServer**
与`DllRegisterServer`类似, 清理写入注册表.

**DllGetClassObject**
函数声明如下:
`STDAPI DllGetClassObject(REFCLSID rclsid, REFIID riid, LPVOID* ppv)`
- `rclsid` 指的是和该dll绑定的clsid
- `riid` 一般是`IID_IClassFactory`, 也可以是其他id来返回特定的对象, 但是一般而言, 一个COM对应一个工厂类即可
- `ppv` 这个参数很好理解, 值得是该函数的返回对象, 该返回对象一般是`IClassFactory`的子类
  
有了`clsid`和`riid`, `DllGetClassObject`函数就可以返回相应的对象.

**DllCanUnloadNow**
这个函数很好理解, 表示该com是否可以unload了.

### 如何使用COM?
- 使用 `CoGetClassObject`函数
```
void* pobj = nullptr;
::CoGetClassObject(clsid, CLSCTX_INPROC_SERVER, nullptr, riid, (void**)&pobj);
```
先调用`CoGetClassObject`函数, 该函数会根据第一个参数clsid来找到对应的dll, 加载该dll后调用其`DllGetClassObject`函数来获得对象.

- 使用 `CoCreateInstance`函数
`CoCreateInstance(clsid, nullptr, CLSCTX_INPROC_SERVER, riid, (void**)&p);
`
这个函数相当于:
```
IClassFactory* pFactory = nullptr;
CoGetClassObject(clsid, CLSCTX_INPROC_SERVER, nullptr, IID_IClassFactory, (void**)&pFactory);

IMyInterface* p = nullptr;
pFactory->CreateInstance(nullptr, riid, (void**)&p);
pFactory->Release();

```
注意其中的`clsid`和`riid`, 这就是为什么`riid` 一般是`IID_IClassFactory`, 返回对象一般是`IClassFactory`的子类
