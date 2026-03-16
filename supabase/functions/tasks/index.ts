import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsResponse, jsonResponse, errorResponse } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

// タスクリストを取得してpriority_level別グループで返す
async function getTaskList(supabase: ReturnType<typeof supabaseClient>, user_id: string) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 3日以上経過した完了済みタスクを自動削除
  await supabase
    .from('tasks')
    .delete()
    .eq('user_id', user_id)
    .eq('complete_at', 1)
    .lt('completed_at', threeDaysAgo);

  // 未完了タスク + 完了後3日以内のタスクを取得
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, task_name, complete_at, sort_order, priority, vision_score, excite_score, growth_score, remind_at, priority_level, completed_at, task_type, reason')
    .eq('user_id', user_id)
    .or(`complete_at.eq.0,and(complete_at.eq.1,completed_at.gte.${threeDaysAgo})`)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  const result: Record<string, typeof tasks> = {
    critical: [],
    high: [],
    active: [],
    completed: [],
  };

  for (const task of tasks ?? []) {
    if (task.complete_at === 1) {
      result.completed.push(task);
    } else {
      const level = task.priority_level ?? 'active';
      if (result[level]) {
        result[level].push(task);
      } else {
        result.active.push(task);
      }
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
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
        priority,
        priority_level,
        vision_score,
        excite_score,
        growth_score,
        orders,
        remind_at,
      } = body;

      if (!action || !user_id) return errorResponse('action and user_id are required', 400);

      switch (action) {
        case 'create': {
          // task_limit チェック
          const { count, error: countError } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user_id)
            .eq('complete_at', 0);

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
            return jsonResponse(
              { error: 'TASK_LIMIT_EXCEEDED', task_limit: limit, todo_count },
              403,
            );
          }

          const { error: insertError } = await supabase.from('tasks').insert({
            user_id,
            task_name,
            complete_at: 0,
            task_type: task_type ?? 'mission',
            reason: reason ?? null,
            priority: priority ?? 0,
            priority_level: priority_level ?? 'active',
            sort_order: todo_count + 1,
          });

          if (insertError) return errorResponse(insertError.message, 500);
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

      // アクション後に最新リストを返す
      const list = await getTaskList(supabase, user_id);
      return jsonResponse(list);
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
