const Excel = require('exceljs/dist/exceljs.min.js')
const workbook = new Excel.Workbook()
const worksheet = workbook.addWorksheet('test')
console.log(typeof worksheet.addRow)
