import { APP_ROUTES } from "./routes/index.js";
import { bootWorkbenchPage } from "./pages/workbench/index.js";

if (typeof document !== "undefined") {
  document.documentElement.dataset.route = APP_ROUTES.workbench.name;
  await bootWorkbenchPage();
}
