export async function POST({ cookies, redirect }) {
  cookies.delete("session", { path: "/" });
  return redirect("/");
}
