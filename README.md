# Antaria Cabinet

Закрытый SPA-кабинет для РГПС «Бунт в Антарии».

- **Публичный репозиторий содержит только код** — без игровых данных, новостей и фикстур.
- **Firebase Auth (Google)** + Firestore: первый пользователь становится `admin`, дальше набор закрыт до approve.
- **Данные провинции** — на Google Drive игрока (`drive.file`).
- **Импорт/экспорт** — `antaria-export-v1.json` (контракт для ИИ и будущей БД).

Деплой: GitHub Pages → `https://<user>.github.io/antaria-cabinet/`.

## Стек

Vite + React + TypeScript, HashRouter, Firebase, Google Drive API, zod.

## Локальный запуск

1. Скопируйте `.env.example` → `.env.local` и заполните.
2. `npm install`
3. `npm run dev`

Откройте `http://localhost:5173/antaria-cabinet/`.

## Google Cloud / Firebase (один раз)

1. Создайте Firebase project, включите **Authentication → Google**.
2. Создайте Firestore, задеплойте правила из [`firebase/firestore.rules`](firebase/firestore.rules):
   ```bash
   firebase deploy --only firestore:rules
   ```
3. В Google Cloud того же проекта включите **Google Drive API**.
4. OAuth Client (Web): Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://<user>.github.io`
5. Authorized domains в Firebase: `localhost`, `<user>.github.io`.
6. Положите web-конфиг Firebase и Client ID в `.env.local` / GitHub Actions secrets (`VITE_*`).

### Регистрация

| Событие | Результат |
|---------|-----------|
| Первый Google Sign-In | `role=admin`, `status=approved`, `registrationOpen=false` |
| Следующие Sign-In | `role=user`, `status=pending` (кабинет закрыт) |
| Admin → Approve | доступ к Drive-кабинету |
| Admin → «открыть набор» | новые сразу `approved` (временно) |

## Структура данных на Drive

После онбординга в выбранной папке:

- `antaria.json`, `profile.json`, `indicators.json`, `board.json`
- `relations.json`, `news-local.json`, `maps.json`, `military.json`
- `orders/turn-NN.json`

KPI на дашборде: стабильные id (`budget` = Троны, `rob` = РОБ, `lto`, …). Ведущий показатель: Троны. Правка через настройки на дашборде.

## Экспорт для ИИ / БД

В кабинете: **Импорт/Экспорт** → скачать JSON:

```json
{
  "format": "antaria-export",
  "schemaVersion": 1,
  "app": "antaria-cabinet",
  "province": {},
  "profile": {},
  "indicators": {
    "turn": 0,
    "metrics": [],
    "ledger": []
  },
  "board": {},
  "orders": [],
  "relations": {},
  "newsLocal": {},
  "maps": {},
  "military": { "units": [] }
}
```

Поля `military` и `indicators.ledger` аддитивные: старые экспорты без них парсятся с пустыми списками. Ledger: записи `start` / `order` / `between_turns` / `manual` с `metricId`, `delta` или `balanceAfter`, `title`.

Тот же файл можно сгенерировать ИИ и импортировать обратно; позже — `POST` в серверную БД без смены контракта.

## VK (стена сообщества)

1. Создайте ключ сообщества: [Ключ доступа сообщества](https://dev.vk.com/ru/api/access-token/community-token) (права на стену).
2. Админ → блок «VK»: numeric group id, screen name, token → Firestore `settings/vk` (без дефолтов в коде).
3. Дашборд: виджет стены + лента через `wall.get` (JSONP). Без настроек: локальные `news-local`.

Токен не кладите в `VITE_*` / git. Одобренные пользователи кабинета читают `settings/vk` с клиента (закрытый круг). Для публичного интернета этого недостаточно: вынесите вызов в Cloud Function.

Игровые данные провинции и локальный билдер экспорта живут только в gitignored `data/` / `export/`, не в публичном коде.

## GitHub Pages

1. Settings → Pages → Source: **GitHub Actions**.
2. Добавьте repository secrets с префиксом `VITE_`.
3. Push в `main` / `master` или запустите workflow вручную.

## Безопасность

- Нет данных провинции в git (см. `.gitignore`).
- Firestore Security Rules: approve/`settings/app`/`settings/vk` пишет admin; `settings/vk` читают approved.
- CSP в `index.html`.
- Импорт: лимит размера + zod.
- Текст рендерится как plain text (без raw HTML).

## Вне scope MVP

Общий Drive министров, серверная БД провинций, Cloud Function-прокси для VK.
