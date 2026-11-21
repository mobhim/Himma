/**
 * إرسال شهادات تحدي «قدّها؟» — نادي همة لإعداد القادة
 *
 * هذا الملف لا يعمل من الموقع مباشرة. يُنشر مرة واحدة من حساب Google الخاص بالنادي:
 *
 *  1. افتح https://script.google.com وأنشئ مشروعًا جديدًا، ثم الصق محتوى هذا الملف كاملًا.
 *  2. من «إعدادات المشروع» (Project Settings) ← «خصائص السكربت» (Script properties)
 *     أضف خاصية باسم PIN وقيمتها رمز سرّي يعرفه منظّمو الفعالية فقط.
 *     لا تكتب الرمز داخل هذا الملف ولا في ملفات الموقع.
 *  3. اضغط «نشر» (Deploy) ← «نشر جديد» (New deployment) ← النوع «تطبيق ويب» (Web app):
 *       التنفيذ باسم: أنا (Execute as: Me)
 *       من يملك الوصول: أي شخص (Who has access: Anyone)
 *     ووافق على صلاحية إرسال البريد عندما تُطلب.
 *  4. انسخ رابط التطبيق الذي ينتهي بـ /exec وضعه في الملف game-config.js داخل certEndpoint.
 *
 * الحماية: لا تُرسل أي رسالة بلا رمز المنظّم الصحيح، ونص الرسالة ثابت لا يتحكم فيه المرسل،
 * والمرفق صورة JPEG واحدة بحجم محدود، وهناك حدّ يومي لعدد الرسائل.
 */

var MAX_PER_DAY = 80;        // أقصى عدد شهادات في اليوم
var MAX_BAD_PINS = 15;       // أقصى عدد محاولات خاطئة للرمز في الساعة
var MAX_IMAGE_CHARS = 900000; // حدّ حجم الصورة (base64)، قرابة 650 كيلوبايت

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var pin = props.getProperty('PIN');
    if (!pin) return out(false, 'لم يُضبط رمز المنظّم في خصائص السكربت.', 'setup');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var now = new Date();
      var hourKey = 'bad-' + Utilities.formatDate(now, 'UTC', 'yyyyMMddHH');
      var dayKey = 'sent-' + Utilities.formatDate(now, 'UTC', 'yyyyMMdd');
      var bad = Number(props.getProperty(hourKey) || 0);
      if (bad >= MAX_BAD_PINS) return out(false, 'محاولات كثيرة برمز خاطئ. حاول بعد ساعة.', 'locked');
      if (String(d.pin || '') !== pin) {
        props.setProperty(hourKey, String(bad + 1));
        return out(false, 'رمز المنظّم غير صحيح.', 'pin');
      }
      var sent = Number(props.getProperty(dayKey) || 0);
      if (sent >= MAX_PER_DAY || MailApp.getRemainingDailyQuota() < 1) {
        return out(false, 'وصلنا الحد اليومي لإرسال الشهادات. حاول غدًا.', 'quota');
      }

      var email = String(d.email || '').trim().toLowerCase();
      if (email.length > 120 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(email)) {
        return out(false, 'صيغة الإيميل غير صحيحة.', 'email');
      }
      var team = clean(d.team, 30) || 'الفريق الفائز';
      var image = String(d.image || '');
      if (!image || image.length > MAX_IMAGE_CHARS) return out(false, 'صورة الشهادة غير صالحة.', 'image');
      var bytes = Utilities.base64Decode(image);
      if (bytes.length < 4 || (bytes[0] & 255) !== 0xFF || (bytes[1] & 255) !== 0xD8) {
        return out(false, 'صورة الشهادة غير صالحة.', 'image');
      }
      var blob = Utilities.newBlob(bytes, 'image/jpeg', 'himma-certificate.jpg');

      var text = 'مبروك! فريقك «' + team + '» فاز في تحدي «قدّها؟» للأمثال والكلمات من نادي همة لإعداد القادة. شهادتك مرفقة بهذه الرسالة.';
      MailApp.sendEmail({
        to: email,
        name: 'نادي همة لإعداد القادة',
        subject: 'شهادتك من نادي همة: فوز فريقك في تحدي «قدّها؟»',
        body: text,
        htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:16px;line-height:1.9;color:#2f3620">' +
                  '<p>' + text + '</p><p><img src="cid:cert" alt="شهادة الفوز" style="max-width:100%;border-radius:12px"></p>' +
                  '<p style="color:#6b6a4a;font-size:13px">نادي همة لإعداد القادة</p></div>',
        inlineImages: { cert: blob },
        attachments: [blob]
      });
      props.setProperty(dayKey, String(sent + 1));
      return out(true, '', '');
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out(false, 'تعذّر إرسال الشهادة.', 'error');
  }
}

function doGet() {
  return out(true, 'خدمة شهادات همة تعمل.', '');
}

function clean(v, max) {
  return String(v || '').replace(/[<>&"'\u0000-\u001f]/g, '').trim().slice(0, max);
}

function out(ok, message, code) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok, message: message, code: code }))
    .setMimeType(ContentService.MimeType.JSON);
}
