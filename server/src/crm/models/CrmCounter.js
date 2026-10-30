const mongoose = require('mongoose');

/**
 * Счётчики сквозных номеров (CRM-PLAN A1): номер заказа CrmOrder.num.
 *
 * Номер выдаётся атомарно ($inc + upsert), дублей нет и при параллельных
 * заказах. Нумерация продолжает GetCourse: стартовое значение выставляет
 * импорт (блок J) через setOrderNumAtLeast(последний номер GK).
 */
const crmCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const ORDER = 'order';

crmCounterSchema.statics.next = async function next(name) {
  const doc = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean();
  return doc.seq;
};

crmCounterSchema.statics.nextOrderNum = function nextOrderNum() {
  return this.next(ORDER);
};

// Поднять счётчик до n (не опускает). Для импорта из GetCourse.
crmCounterSchema.statics.setOrderNumAtLeast = async function setOrderNumAtLeast(n) {
  await this.updateOne({ _id: ORDER }, { $max: { seq: n } }, { upsert: true });
};

module.exports = mongoose.model('CrmCounter', crmCounterSchema);
