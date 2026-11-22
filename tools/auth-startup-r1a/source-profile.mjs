// Exact candidate identity only. No deployment or staging acceptance.
export const AUTH_STARTUP_R1A_SOURCE = Object.freeze({
  "id": "V11R6_A9R18_AUTH_TENANT_ISOLATION_STARTUP_R1A_TEST_ONLY",
  "canonicalFileCount": 129,
  "coachAssignmentContract": "server-verified-multi-branch-v1",
  "inputZIP_SHA256": "e23a6a9b452cf002c778a9c4113e4efa4a3964860d70b17a197735802d38dd01",
  "manifest": "tools/auth-startup-r1a/SOURCE_MANIFEST.json",
  "manifestSHA256": "eca12158677388d4748fa89aeb45b982410ea6fcadc020298a39dd84cb8b0d83",
  "runtimeSHA256": "2b419a5be06b2900925ad1eace12430e2bdd3bee2708cd0a1111f8f52eb78ccf",
  "rulesSHA256": "1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3",
  "indexesSHA256": "72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2",
  "buildTag": "qr-v11r6-a9r18-usability-perf-r2r4-r6-20261029",
  "cacheLineageScopes": [
    {
      "token": "a9r18-inventory-stock-authority-r1-20261108",
      "edges": [
        [
          "index.html",
          "app.js"
        ],
        [
          "index.html",
          "js/main.js"
        ],
        [
          "js/main.js",
          "js/core/tuitionCommandBoundary.js"
        ],
        [
          "js/main.js",
          "js/modules/students.js"
        ],
        [
          "js/main.js",
          "js/modules/finance.js"
        ],
        [
          "js/main.js",
          "js/modules/inventory.js"
        ],
        [
          "js/main.js",
          "app.js"
        ],
        [
          "js/core/tuitionCommandBoundary.js",
          "js/services/finance.service.js"
        ],
        [
          "js/modules/students.js",
          "js/services/inventory.service.js"
        ],
        [
          "js/modules/students.js",
          "js/services/finance.service.js"
        ],
        [
          "js/modules/students.js",
          "js/modules/students.js"
        ],
        [
          "js/modules/finance.js",
          "js/services/finance.service.js"
        ],
        [
          "js/modules/inventory.js",
          "js/services/inventory.service.js"
        ],
        [
          "js/services/finance.service.js",
          "js/services/inventory.service.js"
        ]
      ]
    },
    {
      "token": "a9r18-reachable-dom-trust-r1-4b-20261105",
      "edges": [
        [
          "js/main.js",
          "js/core/superAdminServerRefresh.js"
        ],
        [
          "js/main.js",
          "js/ui/render.js"
        ],
        [
          "js/main.js",
          "js/core/multiItemInventorySafety.js"
        ],
        [
          "js/main.js",
          "js/modules/dashboard.js"
        ],
        [
          "js/ui/render.js",
          "js/modules/dashboard.js"
        ],
        [
          "js/ui/render.js",
          "js/ui/render/computation/inventoryRenderer.js"
        ]
      ]
    },
    {
      "token": "a9r18-qr-memo-r1-2d-20261103",
      "edges": [
        [
          "js/main.js",
          "js/ui/render/renderFinance.js"
        ],
        [
          "js/modules/finance.js",
          "js/modules/finance/finance.pagination.js"
        ],
        [
          "js/modules/finance.js",
          "js/ui/render/renderFinance.js"
        ]
      ]
    },
    {
      "token": "att-history-r1-1-20261031",
      "edges": [
        [
          "js/main.js",
          "js/modules/attendance.js"
        ],
        [
          "js/main.js",
          "js/modules/reports/reportExportFacade.js"
        ],
        [
          "js/modules/attendance.js",
          "js/services/attendance.service.js"
        ],
        [
          "js/modules/reports/reportExportFacade.js",
          "js/modules/reports/attendanceExcelReport.js"
        ]
      ]
    }
  ],
  "baseRuntimeSHA256": "3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da",
  "testOnly": true
});
