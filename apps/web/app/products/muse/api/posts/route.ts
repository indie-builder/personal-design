import type { NextRequest } from 'next/server';
import { MUSE_BATCH, filterMuseItems } from '@/lib/muse-catalog';

/** 灵感网格滚动追加的分片接口：按当前筛选返回一个窗口。 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get('q') ?? '';
  const category = params.get('cat') ?? '全部';
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const limit = Math.min(240, Math.max(1, Number(params.get('limit')) || MUSE_BATCH));
  const matched = filterMuseItems({ q, category });
  const items = matched.slice(offset, offset + limit);
  return Response.json({ total: matched.length, items });
}
