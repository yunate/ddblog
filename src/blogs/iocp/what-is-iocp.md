---
title: '如何使用IOCP'
pubDate: 2025-06-16
author: 'yunate'
tags: [
  "异步", "iocp", "http服务器"
]
---
要想理解为什么要使用IOCP, 首先我们要理解同步/异步
### 什么是同步/异步
同步和异步的概念很好理解:
- 同步的操作在函数返回的时候就已经完成了, 比如读一个文件, 当函数返回时所有的数据已经全部读到了, 如果IO比较耗时(比通过网络读取远程的文件)就**一直等待**直到本次的读操作完成

- 异步的操作在函数返回的时候不一定完成了, 比如读一个文件, 如果IO比较耗时, 函数不会等待读操作完成, 它会立刻结束, 当本次的读操作真正完成后在通知调用方(通常是调用回调函数)

**需要注意的是同步/异步操作和线程无关**, 一个异步操作完成时候的通知(callback)可能在其它线程中, 也可能在本线程的事件循环中的某一次事件中. 总之,
我们可以这样理解: 异步操作完成不是在函数调用结束, 而是在未来的某一个时刻完成.

### 为什么要用异步
假设我们正在开发一个服务器用来执行客户端发过来的请求, 需要以下步骤:
1. 等待 client 消息请求
2. 执行一些耗时的IO (这里的耗时并不是指需要大量CPU运算, 而是指需要等待IO完成, 比如请求sql, 读取磁盘文件, 等待网络返回等)
...
3. 执行后续操作

如果这个耗时的IO是同步的, 其伪代码如下:
```cpp
void sync_io(...);

int main() {
  while (!stop) {
    // 1. 等待 client 消息请求
    wait_client_msg(...);
    ...

    // 2. 执行一些耗时IO
    sync_io(...);
    sync_io(...);
    ...

    // 3. 执行后续操作
    other_option(...);

    return 0;
  }
}
```
上面的代码如果只处理一个请求的话是没有问题的, 但如果有多个请求同时发过来的时候, 它只能按顺序一个一个的执行:  
`请求1 --> 请求2 --> 请求3 -->...`  
这是相当低效的, 实际上当我们处理一个请求时, 程序的大多时间都花在了等待sync_io完成上面, 真正占用的资源并不多, 即便PC的性能再高, 后续的请求也依旧需要等待.
 因此我们需要将同步IO函数改为异步IO函数: `sync_io(...)` -> `async_io(..., callback)`

### 为什么不能使用多线程来实现异步
我们很容易想到使用线程将`sync_io`包起来来实现 `sync_io`:
```cpp
void async_io(..., callback) {
  // 让我们暂时忽略线程的生命周期管理
  std::thread([]() {
    auto r = sync_io(...);
    callback(r);
  }).detach();
}
```
这样的话, 每次调用async_io都要创建一个线程, 如果有成千上万的并发, 那么就得创建成千上万的线程, 这会有几个致命缺陷:
1. 创建线程的代价是也是极大的, 比如每创建一个线程就要为其分配一个栈(一般是4M), 所以一台机器能够创建的线程是有限的
2. 当线程数大于CPU核心数时候, 线程的上下文进行切换也是极为消耗资源的, 尤其是线程数量巨大时候, 线程的上下文进行切换的消耗也尤为明显

*顺便一提, 线程池的方案是明显不行的, 使用线程池不过是并行请求数量从1变为线程池的线程数量而已*

### 什么是IOCP
现在我们知道不能来一个io操作就为其开一个线程, 那么我们有什么解决方案呢? 实际上这个问题的关键是**如何知道一个IO操作完成了**, 在使用多线程方案中是在一个线程中等待IO完成, 我们容易想到以下思路:
1. 如果有方法能够检查一个IO是否完成, 我们就可以在一个线程中遍历多个IO操作了, 如果完成了就调用其callback.
2. 或者一个IO完成了能不能给一个通知呢, 这样只需要接到通知的时候调用callback就行了.

*顺便一提, 这俩个思路很类似, 第一个思路封装一下就是第二个*  
这两个想法都是可以实现的, 在windows上比如Select, iocp, 奇怪一点的比如`::WaitForMultipleEvent`, linux上的epol等.

本文主要讲iocp, 它属于第二种思路: **使用支持iocp的io接口时, 当有IO操作完成的时候, 它会通知IOCP**. 在具体说iocp如何使用前, 我们大概可以预想下应该要有以下操作:
1. 创建iocp
2. 执行io操作(支持iocp的接口)时候, 将其绑定到1步中创建的iocp上, 并传入一个key用来表示是哪一个io操作
3. 在一个线程中等待io完成, 并根据传入的key判断是那个io操作完成了

伪代码如下:
```cpp
struct io_ctx {
  callback;
}
void async_io(..., iocp, callback) {
  auto io_handle = create_io_handle();

  // 2. 执行io操作时候, 将其绑定到1步中创建的iocp上, 并传入一个key用来表示是哪一个io操作
  bind_iocp(iocp, io_handle);
  do_io_opt(io_handle, io_ctx{callback});
}

int main() {
  // 1. 创建iocp
  auto iocp = create_iocp();

  std::thread([](iocp){
    // 3. 在一个线程中等待io完成, 并根据传入的key判断是那个io操作完成了
    while (!stop) {
      auto key = iocp.wait();
      key.callback();
    }
  }).detach();

  async_io(... iocp, []() {
    ...
  });
  return 0;
}
```
*这里需要说明的是要使用iocp, 所有的io接口(比如read/write等)都必须支持iocp, windows操作系统已经提供了这一系列接口.*

### 如何使用iocp
思路已经很明确了, 我们需要学习上述步骤中的相关接口

**1. 创建iocp**
```cpp
HANDLE CreateIoCompletionPort(
  [in]           HANDLE    FileHandle,
  [in, optional] HANDLE    ExistingCompletionPort,
  [in]           ULONG_PTR CompletionKey,
  [in]           DWORD     NumberOfConcurrentThreads
);
```
这个接口既可以用来创建iocp, 也可以用来将io和iocp绑定, 用作创造iocp时候, 参数要求如下:

`FileHandle`:                必须为`INVALID_HANDLE_VALUE`

`ExistingCompletionPort`:    必须为`NULL`

`CompletionKey`:             被忽略, 可以传入任意值, 建议为0

`NumberOfConcurrentThreads`: 系统调度iocp所使用的线程数量, 可以指定为0表示使用和处理器数一样多的线程

该接口返回新创建的iocp句柄.
```cpp
HANDLE create_iocp() {
  return ::CreateIoCompletionPort(INVALID_HANDLE_VALUE, NULL, 0, 0);
}
```

**2. 将io操作句柄和iocp绑定**
```cpp
HANDLE CreateIoCompletionPort(
  [in]           HANDLE    FileHandle,
  [in, optional] HANDLE    ExistingCompletionPort,
  [in]           ULONG_PTR CompletionKey,
  [in]           DWORD     NumberOfConcurrentThreads
);
```
依旧使用这个接口, 参数要求如下:

 `FileHandle`:                支持io操作的句柄, 比如使用`CreateFile`接口并指定`FILE_FLAG_OVERLAPPED`标志所打开的文件句柄等

 `ExistingCompletionPort`:    上一步创建的iocp返回句柄

 `CompletionKey`:             用户指定的值, 可以用来帮助程序跟踪哪个 I/O 操作已完成

 `NumberOfConcurrentThreads`: 被忽略

该接口返回上一步创建的iocp返回句柄.
```cpp
bool bind_to_iocp(HANDLE io_handle, HANDLE iocp_handle, ULONG_PTR key) {
  return ::CreateIoCompletionPort(io_handle, iocp_handle, key, 0) != NULL;
}
```

**等待io完成**
``` cpp
BOOL GetQueuedCompletionStatus(
  [in]  HANDLE       CompletionPort,
        LPDWORD      lpNumberOfBytesTransferred,
  [out] PULONG_PTR   lpCompletionKey,
  [out] LPOVERLAPPED *lpOverlapped,
  [in]  DWORD        dwMilliseconds
);
```
该接口是同步接口, 参数解释如下:

`CompletionPort`:               `CreateIoCompletionPort` 返回的iocp句柄

`lpNumberOfBytesTransferred`:   io完成的具体字节数量, 读/写了多少数据

`lpCompletionKey`:              将io操作句柄和iocp绑定时候传入的key

`lpOverlapped`:                 调用io接口时候传入的值, `CompletionKey`用来表示是在哪一个io句柄上的操作, `Overlapped`在该io句柄上的哪次操作, 比如对一个io句柄调用了多次Read/Write, 使用这个参数来确定是哪一个操作成功了.

`dwMilliseconds`:               毫秒为单位的等待超时时间. 指定`INFINITE` 为永不超时

该接口返回`TRUE`表示成功
```cpp
enum class iocp_notify_type
{
    complete = 0,     // 有端口完成了
    closed,           // iocp被关闭了, 此时应该停止pump退出循环
    timeout           // 超时
};

struct iocp_item
{
    bool has_error = false;           // 如果为true, 说明某个端口完成了, 但是有错误, 比如连接断开等
    DWORD error_code = 0;
    u32 transferred_number = 0;
    ULONG_PTR key = NULL;
    OVERLAPPED* overlapped = NULL;
};

iocp_notify_type wait(HANDLE iocp, iocp_item& item, u32 timeout /* = INFINITE */) {
  BOOL result = ::GetQueuedCompletionStatus(iocp, (LPDWORD)&(item.transferred_number), (PULONG_PTR)&item.key, &item.overlapped, timeout);
  if (item.overlapped == NULL) {
      // 当完成端口未完成返回时候有以下几种情况:
      // 1. ioco被关闭, ::GetLastError() == ERROR_ABANDONED_WAIT_0;
      // 2. 超时返回, ::GetLastError() == WAIT_TIMEOUT;
      // 3. 其它情况按超时处理
      if (::GetLastError() == ERROR_ABANDONED_WAIT_0) {
          return iocp_notify_type::closed;
      }

      // ::GetLastError() == WAIT_TIMEOUT and other case.
      return iocp_notify_type::timeout;
  }

  // 当完成端口完成时候有以下几种情况:
  // 1. 当result为TRUE, 正常完成;
  // 2. 当result为FALSE, 异常完成, 比如socket连接断开等;
  item.has_error = !result;
  if (item.has_error) {
      item.error_code = ::GetLaseError();
      item.transferred_number = 0;
  } else {
      (void)::GetOverlappedResult(item.handle, item.overlapped, (LPDWORD)(&item.transferred_number), true);
  }
  return iocp_notify_type::complete;
}
```

现在, 我们来完整的实现下:
```cpp
struct io_ctx {
  HANDLE io_handle = NULL;
  OVERLAPPED ov {0};
  std::function<void(bool successful, int readed)> callback;
};
void async_io(HANDLE iocp_handle, const std::function<void(bool successful, int readed)>& callback) {
  io_ctx * ctx = new io_ctx();
  ctx->callback = callback;
  do {
    auto io_handle = ::CreateFileA("text.txt", GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, NULL);
    if (io_handle == INVALID_HANDLE_VALUE) {
      break;
    }

    ctx->io_handle = io_handle;

    if (!bind_to_iocp(io_handle, iocp_handle, (ULONG_PTR)ctx)) {
      break;
    }

    if (!::ReadFile(handle, buff, (DWORD)buff_size, NULL, &ctx.ov) &&
      ::GetLastError() != ERROR_IO_PENDING) {
      break;
    }
  } while (0);
  ::CloseHandle(iocp_handle);
  if (ctx->io_handle != INVALID_HANDLE_VALUE) {
    ::CloseHandle(ctx->io_handle);
  }
  delete ctx;
}

int main() {
  // 1. 创建iocp
  auto iocp_handle = create_iocp();
  if (iocp_handle == NULL) {
    return -1;
  }

  // 2. 异步io
  async_io(iocp_handle, [](bool successful, int readed) {
    // ... 
  });

  // 3. 在主线程中等待io的完成
  while (true) {
      iocp_item item;
      iocp_notify_type type = wait(iocp_handle, item);
      if (type == iocp_notify_type::closed) {
        break;
      } else if (type == iocp_notify_type::complete) {
        io_ctx * ctx = (io_ctx *)item.key;
        ctx->callback(!item.has_error, item.transferred_number);
        ::CloseHandle(ctx->io_handle);
        delete ctx;
      }
  }
  return 0;
}
```
我们创建了io_ctx这样的结构来保存上下文, 事实上我们可以将这些封装到一个类中, 完整的代码参考:

[iocp 实现](https://github.com/yunate/dd/tree/main/projects/ddbase/iocp)  
[iocp 测试](https://github.com/yunate/dd/tree/main/projects/test/ddbase/iocp)  
[iocp + coroutine + winsocket http(s) server 测试](https://github.com/yunate/dd/blob/main/projects/test/ddbase/network/test_case_http_server.cpp)


