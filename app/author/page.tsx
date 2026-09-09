import Game from "@/components/game/game";
export default function AuthorPreview() {
  return (
    <div className="author-preview">
      <aside className="author-banner">
        作者预览 · 独立测试存档，正式游戏进度不会改变。AI 模型配置与正式游戏共用当前浏览器会话。
        <a href="/">返回正式游戏</a>
      </aside>
      <Game preview />
    </div>
  );
}
