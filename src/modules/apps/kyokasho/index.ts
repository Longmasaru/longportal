// apps/kyokasho の公開 API。src/app はここ経由でのみ参照する。
export { BookPage, BooksPage, ChapterPage } from "./components/pages";
export { ManagePage } from "./components/manage-page";
export { handleImageRequest } from "./image-route";
export { manifest } from "./manifest";
