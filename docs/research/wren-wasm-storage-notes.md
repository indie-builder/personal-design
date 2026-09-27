# Wren DataFusion WASM：执行与存储核查

日期：2026-09-26。范围：官方 Wren WASM 源码、其锁定的 DataFusion 53.0.0，以及 Arrow/Rust 官方资料。执行路径按源码核查；另用实际发布的 Wren 0.4.1 做了下文的有界性能探针，不作通用吞吐或容量承诺。[依赖锁文件](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/Cargo.lock)

## 结论

JSON/CSV 是导入格式；注册后数据变成 **Arrow 列式内存批次**，DataFusion 对批次执行 SQL，并非每次问题都遍历和重新解析原始 JSON/CSV。因此它仍是列式分析，但当前 Wren WASM 封装没有提供原生 DuckDB 那样的持久化数据库文件和磁盘执行环境。[Arrow 列式规范](https://arrow.apache.org/docs/format/Columnar.html)、[Wren 注册与执行源码](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs)

| 入口 | 实际执行前的数据路径 | 含义 |
| --- | --- | --- |
| `registerJson` | JS 对象 → `JSON.stringify` → Rust 转 NDJSON → 推断 schema → Arrow `RecordBatch` → 全量 `collect` → `MemTable` | 有序列化、解析与全量装载成本；同一 engine 后续查询可复用已注册数据，不必重复解析。[TS wrapper](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/sdk/src/index.ts)、[Rust L99–139](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L99-L139) |
| `registerCsv` | CSV 字节 → schema 推断（默认最多 1000 行，可显式给 schema）→ 全量解析为 Arrow batches → `MemTable` | 不是流式查询 CSV 文件；推断只看部分行，不代表只加载部分行。[L179–279](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L179-L279) |
| `registerParquet`（inline） | 整个字节数组 → Rust `data.to_vec()` → Parquet reader → 全量 Arrow batches → `MemTable` | 导入后是列式内存表，但**不保留按本次 SQL 投影/过滤按需读取 Parquet 的入口**；注册时尚无查询条件，源码未设置列投影/行组选择。[L142–176](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L142-L176) |
| `loadMDL` 的 HTTP(S) URL 模式 | 注册 HTTP object store → `ParquetFormat` + `ListingTable` → 先从文件 footer 推断 schema → 查询时扫描 Parquet | 与 inline 不同，不在注册时把整文件解码为 MemTable；可利用 Parquet 扫描优化，服务端须支持 Range，浏览器还受 CORS 约束。[L355–425](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L355-L425)、[L554–586](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L554-L586)、[README](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/README.md) |

## 列裁剪、过滤、内存与返回结果

- **列式不等于没有导入成本。** MemTable 后续扫描能使用投影，但原始注册已经加载全表；只能减少后续计算使用的列，不能追回这次导入的解析/解码成本。[DataFusion 内存数据源](https://github.com/apache/datafusion/blob/53.0.0/datafusion/datasource/src/memory.rs)
- **URL Parquet 有条件裁剪能力，不应笼统说所有过滤都下推。** DataFusion 53 默认启用行组统计裁剪 `pruning` 和 `enable_page_index`；解码阶段的行过滤 `pushdown_filters` 默认关闭。效果还取决于查询谓词、文件统计信息与布局；Wren 这里使用默认 `ParquetFormat`，未看到专门开启该项。[默认配置](https://github.com/apache/datafusion/blob/53.0.0/datafusion/common/src/config.rs#L684-L715)
- **返回值也全量收集。** `query` 调用 `df.collect()`，再把所有结果 batches 写成 JSON，TS 再 `JSON.parse`。不是流式 Arrow 结果接口；大结果集会增加内存与转换成本，聚合后少量结果更适合这个 API。[执行 L600–631](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L600-L631)、[TS wrapper](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/sdk/src/index.ts)
- **存在多种临时表示。** JS 输入/字符串、WASM 内存中的解码数据、结果 JSON/JS 对象可能在处理阶段同时存在；不能以压缩 Parquet 大小作为峰值内存估计。这是上述复制与转换路径的推论，不是内存实测值。

## 不能从原生 DataFusion 类推的能力

| 项目 | 此 Wren WASM build 的边界 |
| --- | --- |
| 多核执行 | 构造器设 `with_target_partitions(1)`，Tokio 使用 `new_current_thread()`；不是原生 DataFusion 默认多线程执行配置。[L63–82](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L63-L82) |
| 内存上限 | Wren 构造器未配置受限 memory pool；DataFusion 默认使用 `UnboundedMemoryPool`。这表示没有主动配置查询预算，不代表宿主内存无限。[Wren 构造器](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L63-L82)、[DataFusion RuntimeEnv](https://github.com/apache/datafusion/blob/53.0.0/datafusion/execution/src/runtime_env.rs#L452-L453) |
| 磁盘 spill | 原生 DataFusion 支持磁盘 spill，但此包目标是 `wasm32-unknown-unknown`，没有配置宿主文件系统桥接；Rust 对该目标明确说明 `std::fs` 返回错误。因此不能把原生引擎的外部排序/磁盘溢写保证套用到此包，也不能因运行在 Node 就假设 Rust 自动获得 `node:fs`。[构建](https://github.com/Canner/WrenAI/blob/main/.github/workflows/publish-wren-core-wasm.yml)、[Rust 目标说明](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html) |
| 持久化 | 当前公共 API 没有创建/打开持久数据库、保存会话表、接入 OPFS/IndexedDB 的入口。注册表随 engine 生命周期存在；源文件可由应用另存，但重启后要重新注册。URL 源文件持久保存也不等于 engine 是持久化数据库。[发布 API](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts) |

## 对本项目的意义

用户补充首版规模为“几十万行以内、定期导入文件”。对这个明确范围，建议先验证 Wren Node + 服务端磁盘文件：保留原始 CSV 或生成 Parquet 作为持久数据，在 engine 生命周期内加载一次、多轮复用，数据更新后切换到新版本；重启后从文件恢复。Parquet 本身是列式文件，采用它不强制需要 DuckDB。此建议基于下面合成数据实测，不代表已承诺任意宽表/关联都满足延迟目标。

若原意是“DuckDB 持久列式存储 + 重复分析 + 数据增长”，保持 DuckDB 做存储与执行符合这个目标；Wren WASM 的便利是可在 JS 宿主中嵌入语义查询，但它更换了执行路径。纯列式计算不是二者区别，**全量导入、内存生命周期、执行线程与磁盘能力**才是这次选择的重要差异。

性能验收应分别记录初始化、首次导入、已加载后的查询、峰值内存与返回序列化，不能只比较一次 `query()`；这里不以源码推导具体谁快多少。

## 本机性能探针：百万行五列，合成数据

环境：Apple M2 Max、64 GiB RAM、macOS arm64、Node 24.21.0；实际 npm 包 `@wrenai/wren-core-wasm@0.4.1` 与 `@duckdb/node-api@1.5.5-r.5`。DuckDB 显式 `threads=1`，与此 Wren WASM 的单线程配置对照。依赖和生成数据都放在 `/tmp/personal-design-wren-bench.JK5iM3`，未改应用依赖。

每条记录五列：id、region（20 个值）、day（365 个值）、整数 amount、status。查询做状态/日期过滤、地区分组、SUM、COUNT，返回 20 行。金额用整数，避免浮点差异影响正确性断言。所有结果与独立 JavaScript 循环计算结果一致；100,000 行与 1,000,000 行共 10 个案例均通过。

每个案例在独立 Node 进程中运行；初始化、导入、首次查询分别计时，然后连续执行 5 次相同查询取中位数。时长包括各客户端结果转换，Wren 查询还包括 MDL 规划；没有 LLM、网络请求、复杂 Join 或并发。没有清空操作系统文件缓存，因此不是冷磁盘基准。

| 1,000,000 行路径 | 初始化 ms | 导入 ms | 首次查询 ms | 后续查询中位 ms | 进程峰值 RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wren WASM / JSON | 109.8 | 6717.5 | 182.4 | 32.5 | 1497.5 |
| Wren WASM / CSV | 103.5 | 188.8 | 200.9 | 37.9 | 476.3 |
| Wren WASM / inline Parquet | 104.0 | 88.0 | 193.3 | 38.4 | 435.5 |
| 原生 DuckDB / CSV 导入内存表 | 45.0 | 222.6 | 16.7 | 15.6 | 165.5 |
| 原生 DuckDB / 已保存数据库 | 46.3 | 无重新导入 | 8.8 | 6.6 | 89.0 |

数据文件：JSON 68.4 MiB、CSV 24.5 MiB、ZSTD Parquet 2.1 MiB、DuckDB 文件 3.3 MiB。数据有大量重复规律，压缩比不代表业务数据。DuckDB 数据库创建成本发生在准备阶段，不在“打开已有库”的计时中；它的初始化已包含打开文件与连接。

10 万行时：Wren 三种路径的后续查询中位数为 6.5/8.0/8.5 ms；原生 DuckDB CSV/数据库路径为 2.2/1.3 ms。完整原始数值与 5 次采样保存在 [results.json](evidence/wren-wasm-benchmark/results.json)。

解释限制：

- 比较的是本项目候选调用路径，不是公平隔离每项功能的纯引擎排名。原生 DuckDB 一侧没有 Wren 语义规划开销，不能说“DataFusion 固定比 DuckDB 慢若干倍”。
- JSON 导入包括文件读取、JSON.parse，以及 Wren 内部 JSON.stringify/再次解析/Arrow 构建；若调用方本来已有 JS 对象，可以省去最前面的文件读取和 JSON.parse，但其余复制与转换仍存在。
- RSS 是整个 Node 进程的历史峰值，包含运行时、WASM、输入及临时对象，不是数据库稳定内存。不能用表中数字推断手机、浏览器或小内存服务器能承载多少行。
- inline Parquet 注册之后已经全量变为 Arrow 内存表，所以其热查询没有磁盘列裁剪优势。本次未测试 URL Parquet 的按需读取。
- 只验证简单聚合，不能外推复杂 Join、窗口函数、大排序、宽字符串、千万行、更新事务或多用户并发。
- WASM 热查询足以支撑这个小样例的交互，但导入应按数据版本复用，不能每次问答都重新加载百万行 JSON。

### 复现

[探针源码](evidence/wren-wasm-benchmark/bench.mjs) 内含正确性断言，无额外测试框架。复制到新的临时目录运行，避免把合成数据写入仓库；每次用新目录，脚本有意在目标表已存在时失败。

```sh
wren_bench_dir=$(mktemp -d /tmp/wren-wasm-bench.XXXXXX)
cp docs/research/evidence/wren-wasm-benchmark/{bench.mjs,package.json,package-lock.json} "$wren_bench_dir/"
npm ci --prefix "$wren_bench_dir" --ignore-scripts --no-audit --no-fund
node "$wren_bench_dir/bench.mjs"
```

本轮没有修改站点、Pi 或 Next.js 路由。该探针验证了 Node WASM 实际运行，替代此前“Node 分支仅查源码、未运行”的状态；仍未验证 Next.js 生产打包与用户真实数据。
