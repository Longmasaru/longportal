import { requireAppAccess } from "@/modules/core/apps";
import { manifest } from "../manifest";
import { listCategories, listTodos } from "../queries";
import { TodoBoard } from "./todo-board";

/** TODO アプリの入口。アプリ管理で有効にし、表示する相手に当てはまる人だけ(それ以外は 404)。 */
export async function TodoPage() {
  const actor = await requireAppAccess(manifest.appKey);
  const [todos, categories] = await Promise.all([listTodos(actor.userId), listCategories()]);
  return <TodoBoard initialTodos={todos} categories={categories} today={actor.today} />;
}
