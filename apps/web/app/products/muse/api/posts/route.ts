import type { NextRequest } from 'next/server';
import { MUSE_BATCH, musePage } from '@/lib/muse-catalog';

/** 灵感网格滚动追加的分片接口：按当前筛选返回一个窗口。 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const { total, items } = musePage({
    q: params.get('q') ?? '',
    category: params.get('cat') ?? '全部',
    offset: Math.max(0, Number(params.get('offset')) || 0),
    limit: Math.min(240, Math.max(1, Number(params.get('limit')) || MUSE_BATCH)),
  });
  return Response.json({ total, items });
}
