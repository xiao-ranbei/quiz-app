# ========================================
#  Supabase Edge Functions 部署脚本
# ========================================
# 使用方法：
#   1. 右键 → 使用 PowerShell 运行
#   2. 或在 PowerShell 中执行： .\deploy-functions.ps1
# ========================================

$ErrorActionPreference = "Stop"

# 切换到脚本所在目录
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Supabase Edge Functions 部署工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 找到 supabase 可执行文件路径
function Get-SupabasePath {
    $supabasePath = "C:\Users\xiao_\scoop\shims\supabase.exe"
    if (Test-Path $supabasePath) {
        return $supabasePath
    }
    # 尝试从 PATH 中查找
    $cmd = Get-Command supabase -ErrorAction SilentlyContinue
    if ($cmd) {
        return "supabase"
    }
    return $null
}

$supabaseCmd = Get-SupabasePath
if (-not $supabaseCmd) {
    Write-Host "   ❌ 找不到 Supabase CLI，请先安装" -ForegroundColor Red
    Write-Host "   安装命令：scoop install supabase" -ForegroundColor Gray
    exit 1
}

# -------- 1. 检查 supabase CLI ----------
Write-Host "[1/4] 检查 Supabase CLI..." -ForegroundColor Yellow
try {
    $version = & $supabaseCmd --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Supabase CLI 已安装：$version" -ForegroundColor Green
    } else {
        throw "未找到"
    }
} catch {
    Write-Host "   ❌ Supabase CLI 未安装" -ForegroundColor Red
    Write-Host "   请先执行：scoop install supabase" -ForegroundColor Gray
    Write-Host "   或访问：https://supabase.com/docs/guides/cli" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# -------- 2. 检查登录状态 ----------
Write-Host "[2/4] 检查登录状态..." -ForegroundColor Yellow
$projects = & $supabaseCmd projects list 2>$null
if ($LASTEXITCODE -ne 0 -or -not $projects) {
    Write-Host "   ⚠️  未登录，开始登录流程..." -ForegroundColor DarkYellow
    & $supabaseCmd login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ❌ 登录失败" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ✅ 已登录" -ForegroundColor Green
}
Write-Host ""

# -------- 3. 链接项目 ----------
Write-Host "[3/4] 链接项目..." -ForegroundColor Yellow

# 用户的项目 Reference ID
$projectRef = "soiswftjljwcnuzkmpoj"

if (Test-Path ".\supabase\config.toml") {
    $config = Get-Content ".\supabase\config.toml" -Raw
    if ($config -match "project_id\s*=\s*`"$projectRef`"") {
        Write-Host "   ✅ 项目已链接（soiswftjljwcnuzkmpoj）" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  检测到 config.toml 但项目 ID 不匹配，正在重新链接..." -ForegroundColor DarkYellow
        & $supabaseCmd link --project-ref $projectRef
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ 项目链接成功" -ForegroundColor Green
        } else {
            Write-Host "   ❌ 项目链接失败" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "   正在链接项目：soiswftjljwcnuzkmpoj" -ForegroundColor Cyan
    supabase link --project-ref $projectRef
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ 项目链接成功" -ForegroundColor Green
    } else {
        Write-Host "   ❌ 项目链接失败" -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

# -------- 4. 部署函数 ----------
Write-Host "[4/4] 部署 Edge Functions..." -ForegroundColor Yellow
Write-Host ""

$functions = @("ai-test-connection", "ai-resolve", "ai-generate")
$successCount = 0
$failCount = 0

foreach ($func in $functions) {
    Write-Host "   正在部署：$func" -ForegroundColor Cyan
    & $supabaseCmd functions deploy $func
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ $func 部署成功" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "   ❌ $func 部署失败" -ForegroundColor Red
        $failCount++
    }
    Write-Host ""
}

# -------- 完成总结 ----------
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  部署完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  成功：$successCount / $($functions.Count)" -ForegroundColor Green

if ($failCount -gt 0) {
    Write-Host "  失败：$failCount" -ForegroundColor Red
    Write-Host ""
    Write-Host "  建议：" -ForegroundColor Yellow
    Write-Host "  1. 检查网络连接" -ForegroundColor Gray
    Write-Host "  2. 确认项目权限" -ForegroundColor Gray
    Write-Host "  3. 查看 Supabase 控制台的 Edge Functions 日志" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "  🎉 全部部署成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "  下一步：" -ForegroundColor Cyan
    Write-Host "  1. 登录 Supabase 控制台 → Edge Functions 验证" -ForegroundColor Gray
    Write-Host "  2. 在前端个人中心页面测试 AI 连接" -ForegroundColor Gray
}
Write-Host ""
