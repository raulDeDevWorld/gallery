function getDayMonthYearHour () {

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const date = new Date();
    
    return `${date.getHours() > 9  ? date.getHours() : '0' + date.getHours()}:${date.getMinutes() > 9 ? date.getMinutes():'0' + date.getMinutes()} ${date.getHours() >= 12 ? 'pm' : 'am'} ${date.getDate()}-${months[date.getMonth()]}-${date.getUTCFullYear()}`  
}
function getDayMonthYear () {

    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '10', '12']
    const days = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31']
    const date = new Date();
    
    return `${days[date.getDate()]}-${months[date.getMonth()]}-${date.getFullYear()}`  
}
function getMonthYear () {

    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    const date = new Date();
    
    return `${date.getFullYear()}-${months[date.getMonth()]}`  
}
function formatDayMonthYear (inputDate) {

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    return `${inputDate.split('-')[2]}-${months[inputDate.split('-')[1]-1]}-${inputDate.split('-')[0]}`  
}
function formatDayMonthYearInput (inputDate) {

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

    return `${inputDate.split('-')[2]}-${months.indexOf(inputDate.split('-')[1])}-${inputDate.split('-')[0]}`  
}
export { getDayMonthYearHour, getDayMonthYear, getMonthYear, formatDayMonthYear, formatDayMonthYearInput }