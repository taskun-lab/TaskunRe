import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

type Supabase = ReturnType<typeof supabaseClient>;

// ルートタスク一覧をpriority_level別グループで返す（サブタスク件数付き）
async function getTaskList(supabase: Supabase, user_id: string) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 3日以上経過した完了済みルートタスクを自動削除
  await supabase
    .from('tasks')
    .delete()
    .eq('user_id', user_id)
    .eq('complete_at', 1)
    .is('parent_task_id', null)
    .lt('completed_at', threeDaysAgo);

  // ルートタスクのみ取得（parent_task_id IS NULL）
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, task_name, complete_at, sort_order, priority, vision_score, excite_score, growth_score, remind_at, priority_level, completed_at, task_type, reason, depth, target_date')
    .eq('user_id', user_id)
    .is('parent_task_id', null)
    .or(`complete_at.eq.0,and(complete_at.eq.1,completed_at.gte.${threeDaysAgo})`)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  // サブタスク件数を一括取得
  const taskIds = (tasks ?? []).map((t) => t.id);
  const subtaskCountMap: Record<number, number> = {};
  if (taskIds.length > 0) {
    const { data: subtaskRows } = await supabase
      .from('tasks')
      .select('parent_task_id')
      .in('parent_task_id', taskIds)
      .eq('complete_at', 0);
    for (const row of subtaskRows ?? []) {
      if (row.parent_task_id) {
        subtaskCountMap[row.parent_task_id] = (subtaskCountMap[row.parent_task_id] ?? 0) + 1;
      }
    }
  }

  const result: Record<string, unknown[]> = {
    critical: [],
    high: [],
    active: [],
    completed: [],
  };

  for (const task of tasks ?? []) {
    const t = { ...task, subtask_count: subtaskCountMap[task.id] ?? 0 };
    if (t.complete_at === 1) {
      result.completed.push(t);
    } else {
      const level = t.priority_level ?? 'active';
      if (result[level]) {
        result[level].push(t);
      } else {
        result.active.push(t);
      }
    }
  }

  return result;
}

// サブタスクを再帰的に取得してツリー構造を返す
async function getTree(supabase: Supabase, user_id: string) {
  const { data: allTasks, error } = await supabase
    .from('tasks')
    .select('id, task_name, complete_at, task_type, depth, sort_order, parent_task_id, completed_at, reason, target_date, priority_level')
    .eq('user_id', user_id)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  // ツリー構造に組み立て
  const map: Record<number, unknown> = {};
  const roots: unknown[] = [];

  for (const t of allTasks ?? []) {
    map[t.id] = { ...t, children: [] };
  }
  for (const t of allTasks ?? []) {
    if (t.parent_task_id && map[t.parent_task_id]) {
      (map[t.parent_task_id] as { children: unknown[] }).children.push(map[t.id]);
    } else if (!t.parent_task_id) {
      roots.push(map[t.id]);
    }
  }

  return roots;
}

// 子タスクが全完了なら親を自動完了（再帰）
async function propagateCompletion(supabase: Supabase, parentId: number, user_id: string): Promise<void> {
  const { data: siblings } = await supabase
    .from('tasks')
    .select('id, complete_at')
    .eq('parent_task_id', parentId)
    .eq('user_id', user_id);

  if (!siblings || siblings.length === 0) return;
  if (siblings.some((s) => s.complete_at !== 1)) return;

  // 全サブタスク完了 → 親を達成
  await supabase
    .from('tasks')
    .update({ complete_at: 1, completed_at: new Date().toISOString() })
    .eq('id', parentId)
    .eq('user_id', user_id);

  // 祖先へ伝播
  const { data: parent } = await supabase
    .from('tasks')
    .select('parent_task_id')
    .eq('id', parentId)
    .single();

  if (parent?.parent_task_id) {
    await propagateCompletion(supabase, parent.parent_task_id, user_id);
  }
}

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = supabaseClient();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '');

    // GET /tasks/list
    if (req.method === 'GET' && (path.endsWith('/list') || path.endsWith('/tasks'))) {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return errorResponse('user_id is required', 400);
      const list = await getTaskList(supabase, user_id);
      return jsonResponse(list);
    }

    // GET /tasks/subtasks?user_id=&parent_id=
    if (req.method === 'GET' && path.endsWith('/subtasks')) {
      const user_id = url.searchParams.get('user_id');
      const parent_id = url.searchParams.get('parent_id');
      if (!user_id || !parent_id) return errorResponse('user_id and parent_id are required', 400);

      const { data, error } = await supabase
        .from('tasks')
        .select('id, task_name, complete_at, task_type, depth, sort_order, completed_at, remind_at, reason, priority_level')
        .eq('user_id', user_id)
        .eq('parent_task_id', Number(parent_id))
        .order('sort_order', { ascending: true });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data ?? []);
    }

    // GET /tasks/tree?user_id=
    if (req.method === 'GET' && path.endsWith('/tree')) {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return errorResponse('user_id is required', 400);
      const tree = await getTree(supabase, user_id);
      return jsonResponse(tree);
    }

    // POST /tasks/action
    if (req.method === 'POST' && path.endsWith('/action')) {
      const body = await req.json();
      const {
        action,
        user_id,
        task_name,
        task_id,
        task_type,
        reason,
        target_date,
        priority,
        priority_level,
        vision_score,
        excite_score,
        growth_score,
        orders,
        remind_at,
        parent_task_id,
      } = body;

      if (!action || !user_id) return errorResponse('action and user_id are required', 400);

      switch (action) {
        case 'create': {
          const { count, error: countError } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user_id)
            .eq('complete_at', 0)
            .is('parent_task_id', null);

          if (countError) return errorResponse(countError.message, 500);

          const { data: userRow, error: userError } = await supabase
            .from('users')
            .select('task_limit, role')
            .eq('user_id', user_id)
            .single();

          if (userError) return errorResponse(userError.message, 500);

          const isPrivileged = userRow.role === 'developer' || userRow.role === 'admin';
          const limit = isPrivileged ? 9999 : userRow.task_limit;
          const todo_count = count ?? 0;

          if (todo_count >= limit) {
            return jsonResponse({ error: 'TASK_LIMIT_EXCEEDED', task_limit: limit, todo_count }, 403);
          }

          const { error: insertError } = await supabase.from('tasks').insert({
            user_id,
            task_name,
            complete_at: 0,
            task_type: task_type ?? 'default',
            reason: reason ?? null,
            target_date: target_date ?? null,
            priority: priority ?? 0,
            priority_level: priority_level ?? 'normal',
            sort_order: todo_count + 1,
            depth: 0,
          });

          if (insertError) return errorResponse(insertError.message, 500);
          break;
        }

        case 'add_subtask': {
          if (!parent_task_id) return errorResponse('parent_task_id is required', 400);

          // 親タスクの確認（ユーザー所有・depth取得）
          const { data: parent, error: parentError } = await supabase
            .from('tasks')
            .select('id, depth, user_id')
            .eq('id', parent_task_id)
            .eq('user_id', user_id)
            .single();

          if (parentError || !parent) return errorResponse('Parent task not found', 404);

          const newDepth = (parent.depth ?? 0) + 1;
          if (newDepth > 5) return errorResponse('MAX_DEPTH_EXCEEDED', 400);

          // 兄弟タスク数チェック（5個以上は警告レスポンス、ブロックはしない）
          const { count: siblingCount } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('parent_task_id', parent_task_id)
            .eq('user_id', user_id);

          const { error: insertError } = await supabase.from('tasks').insert({
            user_id,
            task_name,
            complete_at: 0,
            task_type: task_type ?? 'default',
            reason: null,
            priority: 0,
            priority_level: 'normal',
            sort_order: siblingCount ?? 0,
            parent_task_id,
            depth: newDepth,
          });

          if (insertError) return errorResponse(insertError.message, 500);

          // 5個超過の場合は警告フラグ付きで返す
          const list = await getTaskList(supabase, user_id);
          if ((siblingCount ?? 0) >= 5) {
            return jsonResponse({ ...list, warning: 'SIBLING_LIMIT_REACHED' });
          }
          break;
        }

        case 'delete': {
          const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        case 'complete': {
          const { error } = await supabase
            .from('tasks')
            .update({ complete_at: 1, completed_at: new Date().toISOString() })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);

          // 親クエストへの達成連鎖
          const { data: completedTask } = await supabase
            .from('tasks')
            .select('parent_task_id')
            .eq('id', task_id)
            .single();
          if (completedTask?.parent_task_id) {
            await propagateCompletion(supabase, completedTask.parent_task_id, user_id);
          }
          break;
        }

        case 'uncomplete': {
          const { error } = await supabase
            .from('tasks')
            .update({ complete_at: 0, completed_at: null })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        case 'set_priority': {
          const { error } = await supabase
            .from('tasks')
            .update({ priority, priority_level })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        case 'update_detail': {
          const { error } = await supabase
            .from('tasks')
            .update({ vision_score, excite_score, growth_score })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        case 'sort_update': {
          if (!Array.isArray(orders)) return errorResponse('orders is required', 400);
          for (const item of orders as { id: string; sort_order: number }[]) {
            const { error } = await supabase
              .from('tasks')
              .update({ sort_order: item.sort_order })
              .eq('id', item.id)
              .eq('user_id', user_id);
            if (error) return errorResponse(error.message, 500);
          }
          break;
        }

        case 'remind_custom': {
          const { error } = await supabase
            .from('tasks')
            .update({ remind_at })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        case 'rename': {
          const { error } = await supabase
            .from('tasks')
            .update({ task_name })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        case 'update_type': {
          const { error } = await supabase
            .from('tasks')
            .update({ task_type, reason })
            .eq('id', task_id)
            .eq('user_id', user_id);
          if (error) return errorResponse(error.message, 500);
          break;
        }

        default:
          return errorResponse(`Unknown action: ${action}`, 400);
      }

      const list = await getTaskList(supabase, user_id);
      return jsonResponse(list);
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
