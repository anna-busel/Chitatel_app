const mongoose = require('mongoose');

/**
 * Баннер на главной приложения (карусель после карточки «Клуб месяца»).
 * UPDATES-PLAN T, 05.11.2026. Первый повод — Чёрная пятница 13–18.11, но
 * механизм общий: картинка + период показа + платформы + действие по тапу.
 *
 * Поля:
 * - title            — внутреннее название для админки (в приложении не видно);
 * - imageStoragePath — путь картинки относительно AUDIO_BASE_PATH
 *                      ('home-banners/<uuid>.jpg'); URL подписывается при отдаче;
 * - startsAt/endsAt  — показ при startsAt <= now < endsAt;
 * - platforms        — где показывать. По умолчанию только iPhone: на Android
 *                      покупок нет (store_policy.dart), акции туда нельзя;
 * - action           — что по тапу. Только внутри приложения (Apple 3.1.1 —
 *                      никаких ссылок наружу/на оплату вне Apple):
 *                        none  — ничего;
 *                        book  — экран разбора bookId;
 *                        books — экран-подборка bookIds (+ пакеты packageIds,
 *                                с 1.0.5) с заголовком listTitle;
 * - showInCatalog    — (1.0.5, 12.11.2026) подборка ещё и вкладкой каталога:
 *                      первый чип с названием listTitle, пока баннер виден.
 *                      Только для action.kind === 'books';
 * - order            — порядок в карусели (по возрастанию);
 * - isActive         — ручной выключатель.
 */
const homeBannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    imageStoragePath: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    platforms: {
      type: [{ type: String, enum: ['ios', 'android'] }],
      default: ['ios'],
    },
    action: {
      kind: { type: String, enum: ['none', 'book', 'books'], default: 'none' },
      bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null },
      bookIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
      listTitle: { type: String, default: '', trim: true },
      packageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Package' }],
    },
    showInCatalog: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

homeBannerSchema.index({ isActive: 1, endsAt: 1 });

module.exports = mongoose.model('HomeBanner', homeBannerSchema);
