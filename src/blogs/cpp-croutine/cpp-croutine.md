---
title: 'C++ 协程'
pubDate: 2025-06-17
author: 'yunate'
tags: [
  "协程", "异步", "C++", "http服务器"
]
---
### 带回调的异步函数有什么问题
我在 [如何使用IOCP](/posts/iocp/what-is-iocp/) 中介绍了为什么要使用异步函数, 一个异步函数的一般是一个带有callback的函数:`void async_io(..., callback);`
假设我们有有如下需求:
> step 1: 使用`async_read`函数读取一段数据  
> step 2: 使用`async_write`函数将读取的数据写到文件中

这是一个很简单需求, 伪代码如下:
```cpp
async_read(..., [](void* buff, int readed_size) {
  async_write(..., buff, readed_size, []() {
    ...
  });
});
```
我们需要在`async_read`的回调函数中执行`async_write`, 如果在`async_write`完成后还有其他的操作, 那么后续的操作也得放到`async_write`的回调中去;

我们将这个问题一般化, 假设要实现的功能有n步, 每一步都要在上一步完成后执行: `step1` -> `step2` -> ... -> `stepn`, 我们可以这样实现这个功能:
```cpp
step1([]() {
  step2([]() {
    step3([]() {
      ...
      stepn([]() {
      });
    });
  });
});
```
上述的代码回调嵌套回调, 这有很多问题: 可读性差、逻辑混乱、调试困难等等. 特别是如果需求发生改变需要修改step的顺序, 代码修改起来会异常痛苦. 而且, 如果其中某些步骤需要循环执行, 比如将`step2`/`step3`循环执行10次后再执行后续步骤, 代码会很难写, 需要额外的参数来判断循环是否结束.

### 在协程出现前的思路
我们将这些step封装到一个类中, 在其callback中调用类成员函数`on_stepx_complete()`, 这样可以缓解回调嵌套过深的问题:
```cpp
class XX {
  // 将每一步封装到step_wrapper中
  void step1_wrapper() { step1([this]() { on_step1_complete() }); }
  void step2_wrapper() { step2([this]() { on_step2_complete() }); }
  ...
  void stepn_wrapper() { stepn([this]() { on_stepn_complete() }); }

  // 回调函数
  void on_step1_complete() {
    step2_wrapper();
  }
  void on_step2_complete() {
    step3_wrapper();
  }
  ...
  void on_stepn_complete() {
  }
};
```
上述伪代码解决了嵌套过深的问题, 但是它将逻辑割裂了, 原本很自然的 `step1` -> `step2` -> ... 被分割到代码的各个部分.

或许我们可以使用状态机思路来解决逻辑割裂的问题:
```cpp
class XX {
  int m_step = 1;
  void state_entrance() {
    if (m_step == 1) {
      step1([step]() {
        ++m_step;
        state_entrance();
      });
      return;
    }

    if (m_step == 2) {
      step2([]() {
        ++m_step;
        state_entrance();
      });
      return;
    }

    ...

    if (m_step == n) {
      stepn([]() {
        ++m_step;
        state_entrance();
      });
      return;
    }

    end();
  }
};
```
*代码中的`if (m_step == 1) { ... }`或许使用switch case 更合适, 但是本文只是为了说明一种思路而不是真的实现一个可以使用的库*

上述代码可以解决嵌套过深问题和逻辑分割问题, 如果需求发生改变需要修改step的顺序代码也容易修改许多. 但是上述有许多类似`if (m_step == 1) {}` 和 `++m_step; state_entrance();` 这样的辅助代码, 并且没有处理函数的返回值和一些局部变量(如果有的话)的保存恢复问题, 我们使用宏来简化辅助代码, 将局部变量和`step`函数返回保存到成员变量中, 而不是函数栈上, 可以这样修改代码:
```cpp
#define CO_AWAIT(expr) if (m_ctx.step < __LINE__ ) { expr; }
#define CO_RESUME() m_ctx.step = __LINE__ ; m_ctx.resume_func()

struct XX_ctx {
  std::function<void()> resume_func;
  int step = 0;
  void* params1 = NULL;
  void* params2 = NULL;
  ...
};

class XX {
  XX_ctx m_ctx;

  XX() {
    m_ctx.resume_func = [this](){
      state_entrance();
    }
  }

  void state_entrance() {
    CO_AWAIT(step1([this](int result) {
        m_ctx.params1 = new int;
        *(m_ctx.params1) = result;
        ...
        CO_RESUME();
    }));

    CO_AWAIT(step2([this]() {
        CO_RESUME();
    }));

    ...

    CO_AWAIT(stepn([this]() {
        CO_RESUME();
    }));

    end();
  }
};
```
上述代码虽然还是有不少问题, 但是这个思路和协程的思路很接近了, 在这个思路下
- 我们的目标是: 将一个带有callback的异步函数封装成协程函数: `async_io(callback)` -> `co_io()`, 相当于将`co_await co_io()`之后的程序放到了`async_io`的callback中执行.
- **协程不能带来性能上的提升, 甚至会比使用异步函数要慢一点, 正真提升性能的是从同步函数到异步函数这一步**

### 使用协程有多优雅
首先我们先提前看看当使用协程后上述代码应该如何写. 假设我们已经将异步函数封装成协程函数`co_stepx()`了, 使用协程函数实现的伪代码如下:
```cpp
foo() {
  co_await co_step1();
  for (int i = 0; i < 10; ++i) {
    co_await co_step2();
    co_await co_step3();
  }
  ...
  co_await co_step2();
}
```
没错, 就像使用同步函数一样, 只需在调用函数前加上co_await即可, 而前文说到的循环问题也会得到了解决

### C20 coroutine的一些概念
cppreference对协程的解释: [Coroutines:](https://en.cppreference.com/w/cpp/language/coroutines.html#:~:text=A%20coroutine%20is%20a%20function%20that%20can%20suspend%20execution%20to%20be%20resumed%20later.%20Coroutines%20are%20stackless%3A%20they%20suspend%20execution%20by%20returning%20to%20the%20caller%2C%20and%20the%20data%20that%20is%20required%20to%20resume%20execution%20is%20stored%20separately%20from%20the%20stack.)  
*A coroutine is a function that can suspend execution to be resumed later. Coroutines are stackless: they suspend execution by returning to the caller, and the data that is required to resume execution is stored separately from the stack.*

- A coroutine is a function that can suspend execution to be resumed later. 协程是一个可以中断并在以后恢复执行的函数. 在上述中异步伪代码中, 有一个上下文对象`XX_ctx`, 通过`return`来中断`state_entrance()`函数; `CO_RESUME`宏通过修改上下文对象`XX_ctx`的`step`, 然后调用上下文对象`XX_ctx`的`resume_func()`仿函数来恢复函数; 相似的, 在C20 coroutine中, **也有一个上下文对象`std::coroutine_handle<>`**, 使用`co_await`来中断函数, 使用用上下文对象`std::coroutine_handle<>`的`resume()`函数来恢复协程.

- Coroutines are stackless, the data that is required to resume execution is stored separately from the stack. 协程是无栈的, 需要保存/恢复的数据会和栈上的数据分开存储. 在上述中异步伪代码中, 可以将需要保存/恢复的栈内容保存在`XX_ctx`中, 类似的在C20中也会将其保存在上下文对象`std::coroutine_handle<>`中:
```cpp
fun() {
  int i = 0;
  co_await co_step1();
  ++i;
  co_await co_step2();
  ...
}
```
`i` 看似分配在栈上的, 但其实是分配在上下文对象`std::coroutine_handle<>`中的(堆上).

### C20 coroutine
C20 coroutine 新加了三个关键字 `co_await`, `co_yield`, `co_return`, 和两个重要概念`awaitable 对象`, `协程函数`.

### co_await 关键字 和 awaitable 对象
- 如果一个对象实现了`await_ready`, `await_suspend`, `await_resume`三个函数, 那么它就是一个awaitable 对象.
- 如果一个对象实现了`operator co_await`函数并且`operator co_await`函数返回了一个awaitable 对象, 那么它也是一个awaitable 对象.

比如:
```cpp
struct awaitable {
  bool await_ready() { return false; }
  void await_suspend(coroutine_handle<>) {}
  T await_resume() {}
};

struct awaitable1 {
  auto operator co_await() {
    return awaitable();
  }
};
```
*上述规则是C20标准规定, 那么为什么标准不提供一个基类(比如iawaitable)让子类继承, 而是强制规定一个对象实现某某函数就是awaitable对象呢? 我猜测可能是和性能和兼容相关, 但无论如何, 让我们先记着这个规则*.

我们来看看这三个函数的作用, 我们以下面的代码为例:
```cpp
struct awaitable {
  bool await_ready() {
    printf("await_ready called\n");
    return false;
  }

  bool await_suspend(coroutine_handle<> h) {
    printf("await_suspend called\n");
    std::thread([this, h]() {
      ::Sleep(1000);
      value = 10;
      h.resume();
    }).detach();
    return true;
  }

  int await_resume() {
    printf("await_resume called\n");
    return value;
  }

  int value = 0;
};

foo() {
  int x = co_await awaitable();
  printf("%d\n", x);
}
```
`await_ready`: 当运行到`co_await awaitable();`时候, `await_ready`函数首先被调用, 它的返回值是`bool`类型:
- 如果返回`true`则不会中断当前函数, 继续运行下一行代码: `printf("%d\n", x);`
- 如果返回`false`则会调用`await_suspend`函数

`await_suspend`: 该函数的参数比较简单, 上文说过每个协程函数都会有一个协程上下文(下文称为`协程句柄`), 当调用到该函数时候会将调用者的`协程句柄`传递过来用来在合适的地方恢复协程函数(本例中是在一个线程中恢复). 它的返回值可以是返回`void`, 或者像本示例中返回`bool`, 或者是返回`coroutine_handle<>`
- 返回值是`void`时候, 中断当前函数, 等待线程中调用`h.resume();`来恢复函数, 这个时候下一行代码: `printf("%d\n", x);`**是在线程中运行的, 而不是在主线程中运行**.
- 返回值是`bool`时候, 如果返回`true`则中断当前函数, 和返回`void`一样; 如果返回`false`则不会中断当前函数就好像`await_ready`返回了`true`一样
- 返回值是`coroutine_handle<>`时候, 被返回的这个协程句柄(假设为`r`)会被唤醒, 当前函数中断, 术语是**对称转移**: 将当前函数的运行权转移给返回的协程句柄`r`, 可以这样理解在中断函数前插入了`r.resume()`这行代码, 但汇编层面是`jmp`而非`call`这样可以减少一层函数调用栈. 那我们可不可以返回true或者void, 在返回前手动调用呢(如下述代码)? 答案是否定的, 因为这样做的话, `await_suspend`函数返回会被推迟到`r.resume()`函数恢复的函数运行之后, 这样的话函数调用栈就会增加一层(*如果编译器没有尾调用(tail call)优化的话, 而且这个尾调用(tail call)优化各个编译器支持也不一样, 我们不应该依赖这个*), 在循环环境下就可能导致栈溢出, 参考: [Symmetric Transfer](https://lewissbaker.github.io/2020/05/11/understanding_symmetric_transfer)
```cpp
struct awaitable {
  bool await_ready() { return false; }

  void await_suspend(coroutine_handle<> h) {
    // 这里只是演示, 调用调用者的resume, 真是情况可能是其他函数的resume, 也会有这样的问题
    h.resume();
  }

  void await_resume() { }

};

foo() {
  for (int i = 0; i < 1000000; ++i) {
    // 有栈溢出风险
    co_await awaitable();
  }
}
```
`await_resume`: 它的返回值会被返回给`auto value = co_await awaitable();`, 可以返回`void`

std 提供了一些常用的awaitable对象:
- `std::suspend_never`: `co_await std::suspend_never()` 不中断当前函数
- `std::suspend_always`: `co_await std::suspend_never()` 中断当前函数

#### 协程函数
一个函数内如果使用了`co_await`, `co_yield`, `co_return`中的任何一个关键字, 这个函数就是一个协程函数. 一个协程函数的返回值必须是一个协程对象:
```cpp
class ddcoroutine {
public:
  class promise_type
  {
  public:
      ddcoroutine get_return_object() { return {} }
      std::suspend_never initial_suspend() noexcept { return {}; }
      std::suspend_never  final_suspend() noexcept { return {}; }
      void return_void() {}
      // 如果有返回值的话, return_void需要被替换为return_value
      // void return_value(T) {}
      void unhandled_exception() {}
  };
}

ddcoroutine foo() {
  co_return;
}
```
一个协程对象必须包含一个`promise_type`内部类, 编译器会为协程函数生成额外代码, 在进入函数前创建`promise_type`对象, 并调用 `get_return_object`和 `initial_suspend`函数, 在函数结束(指的是`co_return`调用时候, 而不是`co_await`中断)前调用`return_void 或者 return_value`和`final_suspend`, 最后销毁`promise_type`对象, 上述代码中的`foo`函数的汇编伪代码相当于:
```cpp
ddcoroutine foo() {
  auto* promise = new ddcoroutine::promise_type;
  auto return_object = promise->get_return_object();
  co_await promise->initial_suspend();

  ...

  promise->return_void();
  co_await promise->final_suspend();
  delete promise;
  co_return;
}
```
现在我们思考一个问题: **如何让一个协程函数能够被`co_await`呢?** 显然这个协程函数对象需要是一个awaitable的对象, 让我们为其添加awaitable对象所需要的三个函数, 或者`operator co_await()` 函数, 我们选择添加`operator co_await()`, 这样代码看起来更清爽一点:
```cpp
class ddcoroutine {
public:
  class promise_type
  {
  public:
      ddcoroutine get_return_object() { return {} }
      std::suspend_never initial_suspend() noexcept { return {}; }
      std::suspend_never  final_suspend() noexcept { return {}; }
      void return_void() {}
      void unhandled_exception() {}
  };
  auto operator co_await() const& noexcept
  {
      return std::suspend_always{};
  }
}

ddcoroutine foo() {
  co_return;
}

ddcoroutine caller() {
  co_await foo();
  co_return;
}

```
现在返回`ddcoroutine`的协程函数`foo`可以使用`co_await`了, 但是`operator co_await()`返回了`std::suspend_always`, 也就是说`caller`永远不会被唤醒了, 而我们期望`caller`在`foo`结束的时候被唤醒. 换句话说: **我们希望`foo`函数在结束的时候调用caller协程句柄的resume函数**. 显然`foo`的协程函数对象的`final_suspend`里面适合调用`caller`协程句柄的`resume`函数, 而上文也提到了awaitable对象的`await_suspend`函数的参数就是`caller`的协程句柄, 所以可以在`operator co_await()::await_suspend`函数中记录`caller`的协程句柄. 现在我们知道协程对象如何获得`caller`的协程句柄, 并且也知道在应该在`final_suspend`中恢复`caller`的协程句柄, 我们来改写上述代码:
```cpp
class ddcoroutine {
public:
  class promise_type
  {
  public:
      ddcoroutine get_return_object() {
        return ddcoroutine(std::coroutine_handle<promise_type>::from_promise(*this));
      }

      // 让initial_suspend函数返回std::suspend_always来在函数正真执行前中断
      std::suspend_always initial_suspend() noexcept { return {}; }
      auto final_suspend() noexcept {
        struct ddfinal_awaiter
        {
            constexpr bool await_ready() const noexcept { return false; }
            std::coroutine_handle<> await_suspend(std::coroutine_handle<>) noexcept
            {
              // 如果直接调用m_caller_handle.resume()的话, 会导致栈溢出, 所以让其返回m_caller_handle
              // 这里返回m_caller_handle的话, 当前协程就被中断了, 后续的清理工作就无法进行了, 可以在
              // 析构函数中调用当前协程句柄的`destroy`来清理.
              return m_caller_handle;
            }

            void await_resume() { }
            std::coroutine_handle<> m_caller_handle = nullptr;
        };
        return ddfinal_awaiter{m_caller_handle};
      }
      void return_void() {}
      void unhandled_exception() {}
  };

  auto operator co_await() const& noexcept
  {
    struct ddawaiter
    {
      constexpr bool await_ready() const noexcept { return false; }
      std::coroutine_handle<> await_suspend(std::coroutine_handle<> caller_handle) noexcept
      {
        // 保存 caller 的协程句柄
        *m_caller_handle = caller_handle;

        // 当前函数在initial_suspend中中断了, 在此处唤醒当前函数
        // 这里不能直接调用m_caller_handle.resume(), 否则的话会导致栈溢出
        return m_self_handle;
      }

      void await_resume() { }
      std::coroutine_handle<> *m_caller_handle = nullptr;
      std::coroutine_handle<> m_self_handle = nullptr;
      
    };

    // 将指针传给awaitable对象, 在其await_suspend中赋值
    return ddawaiter {&m_caller_handle, m_self_handle};
  }

  ddcoroutine(std::coroutine_handle<> self_handle) {
    m_self_handle = self_handle;
  }

  ~ddcoroutine() {
    m_self_handle.destroy();
  }

private:
  std::coroutine_handle<> m_caller_handle;
  std::coroutine_handle<> m_self_handle;
}

ddcoroutine foo() {
  co_return;
}

ddcoroutine caller() {
  co_await foo();
  co_return;
}
```
我们需要关注以下几点:
- 我们让`promise_type::initial_suspend` 返回 `std::suspend_always` 来中断函数, 如果返回`std::suspend_never`的话, 在`co_await`前该函数可能已经完全结束了, 比如这种没有任何异步的协程函数: `ddcoroutine foo() { co_return; }`
- 在`promise_type::get_return_object` 函数中通过`std::coroutine_handle<promise_type>::from_promise(*this)` API获取当前协程函数句柄. 现在我们知道为什么编译器负责创建内部类`promise_type`, 而不是创建整个协程函数对象; 以及为什么协程函数对象不像awaitable对象一样只需实现几个函数即可而是非要提供一个内部类`promise_type`.
- 在`co_await::await_suspend`返回当前函数句柄(`promise_type::get_return_object`中获取并记录的)来恢复当前函数并中断`caller`
- 在`promise_type::final_suspend`中返回`caller`的协程句柄来恢复`caller`函数
- **`promise_type::final_suspend` 恢复了`caller`但是自己中断了, 最后的清理工作还没有运行, 因此需要在析构函数中调用`std::coroutine_handle<>::destroy`函数清理协程句柄**

`co_await foo();` 整个的运行流程如下:
1. `foo()` 创建`promise_type`, 并调用`promise_type::get_return_object`创建协程函数对象
2. 调用`promise_type::initial_suspend` 返回`std::suspend_always`来中断`foo`
3. `caller` 使用`co_await`来调用 `foo::operator co_await()::await_suspend` 返回当前协程句柄来恢复`foo`函数并中断当前函数
4. `foo`运行结束前调用`final_suspend`来恢复`caller`函数, 并中断`foo`
5. `co_await foo();` 运行结束, `foo`协程函数的临时对象被销毁, 在其析构函数中销毁`foo`协程句柄.

上述思路实现的single head coroutine 库: [ddcoroutine_v1](https://github.com/yunate/ddcoroutine_experiment/blob/main/include/ddcoroutine_v1.h)

### `initial_suspend`不中断的方案
上述方案实际上是有一些小问题的, 如果不关心的话也无伤大雅:
- 进入函数立马中断, 这和函数语义有一丢丢冲突, 因为我们实现函数的时候没有在最开始加`co_await`之类的东西, 但是它中断了, 我们希望在第一个`co_await`地方中断
- any函数无法实现, 或者实现它需要额外参数, 那不如使用`initial_suspend`不中断的方案了. (什么是any函数参考C# [Task.WhenAny](https://learn.microsoft.com/dotnet/api/system.threading.tasks.task.whenany?view=net-8.0#system-threading-tasks-task-whenany(system-threading-tasks-task-system-threading-tasks-task)))
我们让`initial_suspend`返回`std::suspend_never`, 然后添加`m_flag`来记录`operator co_await()::await_suspend`和`promise_type::final_suspend`的完成情况来决定在那个函数中resume caller. 通过这种设计就可以实现any函数了. single head coroutine 实现源码: [initial_suspend 不中断方案 ddcoroutine](https://github.com/yunate/ddcoroutine/blob/main/include/ddcoroutine.h)

### 协程函数对返回值的处理
如果不考虑返回`void`的情况的话, 需要将其改为模板类`class ddcoroutine<T>`并添加成员变量`T m_value`, 并在`promise_type::return_value(const T& v)`中为其赋值, 在`operator co_await::await_resume`中将其返回即可;

如果考虑返回`void`情况, 就要提供特化模板类`class ddcoroutine<void>`, 为其提供`promise_type::return_void`函数, 并让`operator co_await::await_resume`返回void即可. 但是这样子会有不少重复代码, 如何消除这些重复代码需要模板元的知识, 这里不多介绍, 可以参考[ddcoroutine return value](https://github.com/yunate/ddcoroutine/blob/53f21a7e82e1733e3ad0928a20e0ee4d8376a9ae/include/ddcoroutine.h#L32C56-L32C57)的做法.

### 如何将异步函数`void async_io(callback)`封装成协程函数
我们知道`await_suspend`函数的参数是caller的协程句柄, 因此我们将`async_io`放到`await_suspend`中调用:
```cpp
auto ddawaitable(const ddco_task& task)
{
    struct ddawaiter
    {
        bool await_ready() { return false; }
        void await_resume() {}
        void await_suspend(std::coroutine_handle<> caller_handle) {
          m_task([caller_handle]() { caller_handle.resume(); });
        }
        ddco_task m_task = nullptr;
    };
    return ddawaiter{ task };
}

ddcoroutine<void> co_io()
{
  co_await ddawaitable([](const std::function& resumer) {
    asyncio([resumer]() {
      resumer();
    });
  });
  co_return;
}

```
**上述代码有个问题: 如果`async_io`的callback是直接同步运行的, 那么在循环里面可能造成栈溢出:**
```cpp
// 这里直接调用callback而不是异步调用callback
void async_io(callback) { callback(); }
ddcoroutine<void> co_io() { .. }
ddcoroutine<void> fnn() {
  for (int i = 0; i < 1000000; ++i) {
    // 栈溢出
    co_await co_io();
  }
}
```

我们可以使用一个变量来记录在`await_suspend`返回前, `m_task`是否已经运行结束了:
```cpp
auto ddawaitable(const ddco_task& task)
{
    struct ddawaiter
    {
        bool await_ready() { return false; }
        void await_resume() {}
        bool await_suspend(std::coroutine_handle<> caller_handle) {
          m_task([caller_handle, this]() {
            if (m_flag.exchange(true, std::memory_order_acq_rel)) {
              // path 1
              caller_handle.resume();
            } else {
              // path 2
              // 有以下两种情况, 都可以认为也是同步的, 这两种情况只要让await_suspend返回false来唤醒caller即可.
              // 1. 该callback是同步的.
              // 2. 线程调度的非常快, await_suspend还没返回就已经完成了
            }
          });

          if (m_flag.exchange(true, std::memory_order_acq_rel)) {
            // path 2
            return false;
          } else {
            // path 1
            // !!! 非常危险 !!!, 请注意!!!
            // 运行到这里的时候, caller_handle.resume(); 可能已经在另外的一个线程中运行了
            // 这种情况下ddawaiter已经被析构了, 在使用任何该类的成员都是未定义行为, 包括返回std::coroutine_handle<>
            // 所以本函数选择返回bool类型而不是std::coroutine_handle<>类型
            return true;
          }
        }

        ddco_task m_task = nullptr;
        // 必须使用原子量来保证同步
        std::atomic_bool m_flag = false;
    };
    return ddawaiter{ task };
}

ddcoroutine<void> co_io()
{
  co_await ddawaitable([](const std::function& resumer) {
    asyncio([resumer]() {
      resumer();
      return;
    });
  });
  co_return;
}

```

### 如何实现ddcoroutine_all
参考[ddcoroutine_all](https://github.com/yunate/ddcoroutine/blob/53f21a7e82e1733e3ad0928a20e0ee4d8376a9ae/include/ddcoroutine.h#L533C1-L533C82)
### 如何实现ddcoroutine_any
参考[ddcoroutine_any](https://github.com/yunate/ddcoroutine/blob/53f21a7e82e1733e3ad0928a20e0ee4d8376a9ae/include/ddcoroutine.h#L543)
