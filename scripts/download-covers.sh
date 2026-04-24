#!/bin/bash
# Скачивает обложки книг из g1orgi89/reader-bot в app/assets/book-covers/
# Одноразовый скрипт — запускается один раз после клонирования репо.
# Запускать из корня проекта Chitatel_app.
#
# Использование:
#   cd ~/Chitatel_app
#   bash scripts/download-covers.sh

set -e

if [ ! -d "app" ]; then
  echo "❌ Ошибка: папка app/ не найдена."
  echo "   Запусти скрипт из корня проекта: cd ~/Chitatel_app && bash scripts/download-covers.sh"
  exit 1
fi

TARGET_DIR="app/assets/book-covers"
mkdir -p "$TARGET_DIR"
echo "📂 Папка назначения: $TARGET_DIR"

BASE_URL="https://raw.githubusercontent.com/g1orgi89/reader-bot/main/mini-app/assets/book-covers"

COVERS=(
  "12_pravil_zhizni.png"
  "4000_nedel.png"
  "43.png"
  "ada_ili_otrada.png"
  "alice_wonderland.png"
  "anna_karenina.png"
  "atomnye_privychki.png"
  "besy.png"
  "biografiya_lva_tolstogo.png"
  "biografiya_vladimira_nabokova.png"
  "bratya_karamazovy.png"
  "eat_pray_love.png"
  "facultativ_children_classics.png"
  "facultativ_dostoevsky.png"
  "facultativ_foreign_classics.png"
  "facultativ_nabokov.png"
  "facultativ_russian_classics.png"
  "faust.png"
  "geroy_nashego_vremeni.png"
  "gore_ot_uma.png"
  "gospozha_bovari.png"
  "grozdya_gneva.png"
  "idiot.png"
  "igrok.png"
  "iskusstvo_lyubit.png"
  "lyudi_kotorye_igrayut_v_igry_igry_v_kotorye_igrayut_lyudi.png"
  "malenkii_princ.png"
  "myortvye_dushi.png"
  "nelyubimaya_doch.png"
  "nevernost.png"
  "nevynosimaya_legkost_bytiya.png"
  "ottsy_i_deti.png"
  "paket_goals_ach.png"
  "paket_love_rel.png"
  "paket_understand_yourself.png"
  "paket_woman.png"
  "paradoks_odinochestva.png"
  "potok.png"
  "prestuplenie_i_nakazanie.png"
  "smert_ivana_ilicha.png"
  "sobache_serdtse.png"
  "sto_let_odinochestva.png"
  "toshnota.png"
  "tysyachelikiy_geroy.png"
  "uyti_chtoby_vyrasti.png"
  "vglyadyvayas_v_solntse.png"
  "vishnyovyy_sad.png"
  "voyna_i_mir.png"
  "vozrast.png"
  "vremya_dengi.png"
  "vse_dorogi_vedut_k_sebe.png"
  "vsyo_delo_v_pape.png"
  "vybor.png"
  "ya_u_sebya_odna_ili_vereteno_vasilisy.png"
  "zaschita_luzhina.png"
)

TOTAL=${#COVERS[@]}
SUCCESS=0
FAILED=0
FAILED_LIST=()

echo "📥 Скачиваю $TOTAL обложек..."
echo ""

for i in "${!COVERS[@]}"; do
  FILE="${COVERS[$i]}"
  NUM=$((i + 1))
  printf "[%2d/%d] %s ... " "$NUM" "$TOTAL" "$FILE"

  if curl -sSfL -o "$TARGET_DIR/$FILE" "$BASE_URL/$FILE"; then
    echo "✅"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "❌"
    FAILED=$((FAILED + 1))
    FAILED_LIST+=("$FILE")
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Успешно: $SUCCESS из $TOTAL"
if [ $FAILED -gt 0 ]; then
  echo "❌ Ошибок: $FAILED"
  echo "   Не скачались:"
  for f in "${FAILED_LIST[@]}"; do
    echo "   - $f"
  done
fi
echo "📦 Размер папки:"
du -sh "$TARGET_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Дальше закоммить обложки:"
echo "  git add app/assets"
echo "  git commit -m 'assets: добавлены обложки книг из reader-bot'"
echo "  git push"
