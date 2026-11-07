# Defect A — Family canonical month autofill

Baseline: `app.js → setupAutocomplete → suggestion.onclick → combo1/combo2` chỉ điền fee khi truthy; không gọi canonical helper, không gán `combo_monthN`. RED thực: Alice fee 500000 được điền nhưng month vẫn rỗng; helper call count = 0.

Candidate lấy đúng `allProfiles[name]` tại lúc chọn suggestion; dùng `filterMonth` nếu khớp YYYY-MM (month 01–12), nếu không dùng `getLocalToday().slice(0,7)`. Gọi đúng owner:

```js
window.getChargeableTuitionMonths(profile, horizonMonth, { reason: 'family-combo-autofill' })
```

`getChargeableTuitionMonths` và `computeTuitionDebtCanonical` không sửa. Kết quả có tháng thì dùng `owedMonths[0]`, giữ nguyên thứ tự owner trả về; không sort lại trong autofill. Không nợ thì input rỗng, không tự điền tháng hiện tại. Thiếu helper cũng không tự dựng tháng. Không copy paidUntil/paidMonths/skippedMonths policy.

53/53 assertion actual-source kiểm tra combo1 và combo2, một/nhiều tháng nợ, skipped, paid-through, feeExempt, quit/inactive canonical result, invalid horizon fallback, canonical order và zero SDK reads. `A06` giữ nguyên existing quit suggestion filter và chứng minh canonical inactive/quit không tạo debt months; không thêm policy status mới.

Đây là default UI. Tại lúc thu, write-time server evidence và existing TuitionCommandBoundary vẫn quyết định có được ghi hay không.
