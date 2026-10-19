"""Create a self-contained, offline PowerShell 5.1 runner for a saved variation."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import uuid
from datetime import datetime, timezone

from . import storage


PS_ENGINE = r'''# MockAíZé standalone runner. MIT License; no application, Python, network, or state dependency.
[CmdletBinding()]
param(
  [string]$OutputDirectory = $PSScriptRoot,
  [string]$InputFile,
  [ValidateRange(0,500)][int]$Count = 0,
  [string]$BaseDate,
  [long]$FileIndex = -1
)
$ErrorActionPreference = 'Stop'
$script:MaxInputBytes = 2000000
$script:MaxOutputBytes = 100000000
$script:Rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$script:ConfigJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__CONFIG_B64__'))
$script:Config = $script:ConfigJson | ConvertFrom-Json
$script:DateReference = [DateTimeOffset]::UtcNow
$effectiveBaseDate = if($PSBoundParameters.ContainsKey('BaseDate')){$BaseDate}elseif($script:Config.baseDate){[string]$script:Config.baseDate}else{[DateTime]::UtcNow.ToString('yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)}
try {$parsedBaseDate=[DateTime]::ParseExact($effectiveBaseDate,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None)}catch{throw 'Data-base inválida. Use AAAA-MM-DD.'}
$effectiveFileIndex = if($PSBoundParameters.ContainsKey('FileIndex')){$FileIndex}else{[long]$script:Config.fileIndex}
if($effectiveFileIndex -lt 0 -or $effectiveFileIndex -gt 999999999){throw 'Índice do arquivo deve ficar entre 0 e 999999999.'}

function Fail([int]$Code,[string]$Message) { [Console]::Error.WriteLine($Message); exit $Code }
function Get-CodePointCount([string]$Text) {
  $n=0; for($i=0;$i -lt $Text.Length;$i++){ if([char]::IsHighSurrogate($Text[$i]) -and $i+1 -lt $Text.Length -and [char]::IsLowSurrogate($Text[$i+1])){$i++};$n++ }; return $n
}
function Get-Symbols([string]$Text) {
  $items=New-Object 'System.Collections.Generic.List[string]';for($i=0;$i -lt $Text.Length;$i++){
    if([char]::IsHighSurrogate($Text[$i]) -and $i+1 -lt $Text.Length -and [char]::IsLowSurrogate($Text[$i+1])){$items.Add($Text.Substring($i,2));$i++}else{$items.Add([string]$Text[$i])}
  };return ,$items.ToArray()
}
function Random-Int([long]$Min,[long]$Max) {
  if($Max -lt $Min -or ($Max-$Min) -gt 4294967295){throw 'Intervalo aleatório inválido.'}
  $range=[uint64]($Max-$Min+1);$limit=[uint64]4294967296-[uint64]4294967296%$range;$bytes=New-Object byte[] 4
  do{$script:Rng.GetBytes($bytes);$value=[uint64][BitConverter]::ToUInt32($bytes,0)}while($value -ge $limit)
  return [long]($Min+($value%$range))
}
function Random-Text([int]$Length,[string]$Alphabet) {
  $symbols=Get-Symbols $Alphabet;if($symbols.Count -eq 0){throw 'Informe um alfabeto não vazio.'}
  $builder=New-Object Text.StringBuilder;for($i=0;$i -lt $Length;$i++){[void]$builder.Append($symbols[(Random-Int 0 ($symbols.Count-1))])};return $builder.ToString()
}
function Read-Xml([string]$Text,[int]$Limit) {
  if([Text.Encoding]::UTF8.GetByteCount($Text) -gt $Limit){throw 'O XML ultrapassa o limite permitido.'}
  if($Text -match '<!\s*(DOCTYPE|ENTITY)'){throw 'DOCTYPE e entidades não são aceitos.'}
  $settings=New-Object Xml.XmlReaderSettings;$settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null;$settings.MaxCharactersInDocument=$script:MaxOutputBytes
  $doc=New-Object Xml.XmlDocument;$doc.PreserveWhitespace=$true;$doc.XmlResolver=$null
  $reader=[Xml.XmlReader]::Create((New-Object IO.StringReader($Text)),$settings);try{$doc.Load($reader)}finally{$reader.Dispose()};return $doc
}
function Get-Segments([string]$Path){foreach($segment in ($Path|ConvertFrom-Json)){$segment}}
function Segments-Equal($A,$B){return (($A.ns -ceq $B.ns) -and ($A.name -ceq $B.name) -and [bool]$A.attribute -eq [bool]$B.attribute)}
function Starts-WithSegments($PathSegments,$PrefixSegments){if($PathSegments.Count -lt $PrefixSegments.Count){return $false};for($i=0;$i -lt $PrefixSegments.Count;$i++){if(-not (Segments-Equal $PathSegments[$i] $PrefixSegments[$i])){return $false}};return $true}
function Resolve-Absolute($Document,[string]$Path,$GroupPath,[int]$Index=0) {
  $segments=@(Get-Segments $Path);if($GroupPath){$group=@(Get-Segments $GroupPath);if($Index -gt 0 -and (Starts-WithSegments $segments $group)){$segments[$group.Count-1].index=$Index+1}}
  $current=$Document
  foreach($segment in $segments){
    if($segment.attribute){
      $owner=$current;if($owner -is [Xml.XmlDocument]){$owner=$owner.DocumentElement};if(-not ($owner -is [Xml.XmlElement])){return $null}
      $found=$null;foreach($attr in $owner.Attributes){if($attr.LocalName -ceq $segment.name -and $attr.NamespaceURI -ceq $segment.ns){$found=$attr;break}};$current=$found
    }else{
      if($current -is [Xml.XmlDocument]){$root=$current.DocumentElement;if($null -eq $root -or $root.LocalName -cne $segment.name -or $root.NamespaceURI -cne $segment.ns){return $null};$current=$root;continue}
      if(-not ($current -is [Xml.XmlElement])){return $null};$matches=New-Object 'System.Collections.Generic.List[Xml.XmlElement]'
      foreach($child in $current.ChildNodes){if($child -is [Xml.XmlElement] -and $child.LocalName -ceq $segment.name -and $child.NamespaceURI -ceq $segment.ns){$matches.Add($child)}}
      $position=[int]$segment.index-1;if($position -lt 0 -or $position -ge $matches.Count){return $null};$current=$matches[$position]
    }
    if($null -eq $current){return $null}
  };return $current
}
function Resolve-Record($Record,[string]$Path,[string]$GroupPath) {
  $segments=@(Get-Segments $Path);$group=@(Get-Segments $GroupPath)
  if(-not (Starts-WithSegments $segments $group)){return $null}
  $remaining=@();if($segments.Count -gt $group.Count){$remaining=$segments[$group.Count..($segments.Count-1)]}
  $current=$Record
  foreach($segment in $remaining){
    if($segment.attribute){$found=$null;foreach($attr in $current.Attributes){if($attr.LocalName -ceq $segment.name -and $attr.NamespaceURI -ceq $segment.ns){$found=$attr;break}};$current=$found}
    else{$matches=New-Object 'System.Collections.Generic.List[Xml.XmlElement]';foreach($child in $current.ChildNodes){if($child -is [Xml.XmlElement] -and $child.LocalName -ceq $segment.name -and $child.NamespaceURI -ceq $segment.ns){$matches.Add($child)}};$position=[int]$segment.index-1;if($position -lt 0 -or $position -ge $matches.Count){return $null};$current=$matches[$position]}
    if($null -eq $current){return $null}
  };return $current
}
function Get-Value($Node,[string]$Path,[string]$GroupPath,[int]$Index=0) {
  if($null -eq $Node){throw "Campo não encontrado: $Path"};if($Node -is [Xml.XmlAttribute]){return [string]$Node.Value};return [string]$Node.InnerText
}
function Is-Connected($Node,$Document){if($null -eq $Node){return $false};$current=$Node;if($current -is [Xml.XmlAttribute]){$current=$current.OwnerElement};while($current -is [Xml.XmlNode]){if($current -eq $Document.DocumentElement){return $true};$current=$current.ParentNode};return $false}
function Set-NodeValue($Node,[string]$Value){if($Node -is [Xml.XmlAttribute]){$Node.Value=$Value;return};$characters=New-Object 'System.Collections.Generic.List[Xml.XmlCharacterData]';foreach($child in @($Node.ChildNodes)){if($child.NodeType -in @([Xml.XmlNodeType]::Text,[Xml.XmlNodeType]::CDATA,[Xml.XmlNodeType]::Whitespace,[Xml.XmlNodeType]::SignificantWhitespace)){$characters.Add([Xml.XmlCharacterData]$child)}};if($characters.Count -eq 0){[void]$Node.InsertBefore($Node.OwnerDocument.CreateTextNode($Value),$Node.FirstChild);return};$first=$characters[0];if($first.NodeType -eq [Xml.XmlNodeType]::CDATA -and $Value.Contains(']]>')){$replacement=$Node.OwnerDocument.CreateTextNode($Value);[void]$Node.ReplaceChild($replacement,$first)}else{$first.Data=$Value};for($i=1;$i -lt $characters.Count;$i++){[void]$Node.RemoveChild($characters[$i])}}
function Remove-Node($Node){if($Node -is [Xml.XmlAttribute]){[void]$Node.OwnerElement.Attributes.Remove($Node)}elseif($Node.ParentNode){[void]$Node.ParentNode.RemoveChild($Node)}}
function Check-Length([string]$Value,$Expected){if($null -ne $Expected -and [string]$Expected -ne ''){$length=Get-CodePointCount $Value;if($length -ne [int]$Expected){throw "O valor tem $length caracteres; o campo exige exatamente $Expected."}};return $Value}
function Get-List($Values){if($Values -is [Array]){$items=@($Values|ForEach-Object{[string]$_})}else{$items=@(([string]$Values -split "`r?`n")|ForEach-Object{[string]$_})};$items=@($items|ForEach-Object{$_.Trim()}|Where-Object{$_});if($items.Count -eq 0){throw 'Lista vazia.'};if($items.Count -gt 1000){throw 'A lista excede 1.000 valores.'};return ,$items}
function New-CPF([bool]$Mask){$base=Random-Text 9 '0123456789';if($base -match '^(\d)\1+$'){$base=$base.Substring(0,8)+$(if($base[0] -eq '0'){'1'}else{'0'})};$calc={param($s)$sum=0;for($i=0;$i -lt $s.Length;$i++){$sum+=([int][string]$s[$i])*($s.Length+1-$i)};$d=($sum*10)%11;if($d -eq 10){return '0'};return [string]$d}.GetNewClosure();$first=$base+(& $calc $base);$result=$first+(& $calc $first);if($Mask){return $result.Substring(0,3)+'.'+$result.Substring(3,3)+'.'+$result.Substring(6,3)+'-'+$result.Substring(9,2)};return $result}
function CNPJ-Digits([string]$Base){$calc={param($s,$weights)$sum=0;for($i=0;$i -lt $s.Length;$i++){$sum+=([int][char]$s[$i]-48)*$weights[$i]};$r=$sum%11;if($r -lt 2){return '0'};return [string](11-$r)}.GetNewClosure();$first=&$calc $Base @(5,4,3,2,9,8,7,6,5,4,3,2);return [string]$first+(&$calc ($Base+$first) @(6,5,4,3,2,9,8,7,6,5,4,3,2))}
function New-CNPJ($Formula){$est=[string]$Formula.establishment;if(-not $est){$est='0001'};$alphabet=if($Formula.mode -eq 'A'){'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'}else{'0123456789'};if($est.Length -ne 4 -or $est -eq '0000' -or ($Formula.mode -ne 'A' -and $est -notmatch '^\d{4}$') -or ($Formula.mode -eq 'A' -and $est -notmatch '^[A-Z0-9]{4}$')){throw 'Estabelecimento de CNPJ inválido.'};do{$root=Random-Text 8 $alphabet}while($root -match '^(\d)\1+$');$base=$root+$est;$result=$base+(CNPJ-Digits $base);if($Formula.mask){return $result.Substring(0,2)+'.'+$result.Substring(2,3)+'.'+$result.Substring(5,3)+'/'+$result.Substring(8,4)+'-'+$result.Substring(12,2)};return $result}
function Get-DateMask($Formula){
 if($Formula.format -ne 'custom'){if($Formula.format){return [string]$Formula.format};return 'yyyy-MM-dd'}
 $v=@{day=$true;month=$true;year=$true;hour=$true;minute=$true;second=$true;order='DMY';yearDigits='4';dateSeparator='/';timeSeparator=':';join=' ';milliseconds=$false;timezone=$false;zone='app'}
 if($Formula.custom){foreach($property in $Formula.custom.PSObject.Properties){$v[$property.Name]=$property.Value}}
 $names=@{D='day';M='month';Y='year'};$tokens=@{D='dd';M='MM';Y=$(if($v.yearDigits -eq '2'){'yy'}else{'yyyy'})}
 $date=(@($v.order.ToCharArray()|ForEach-Object{$key=[string]$_;if($v[$names[$key]]){$tokens[$key]}}) -join $v.dateSeparator)
 $time=(@(@('hour','minute','second')|ForEach-Object{if($v[$_]){@{hour='HH';minute='mm';second='ss'}[$_]}}) -join $v.timeSeparator)
 if($v.second -and $v.milliseconds){$time+='.fff'}
 if(-not $date -and -not $time){throw 'Selecione pelo menos um componente.'}
 $join=if($date -and $time){if($v.join -eq 'T'){"'T'"}else{$v.join}}else{''}
 $suffix=if($time -and $v.timezone){if($v.zone -eq 'utc'){"'Z'"}else{'zzz'}}else{''}
 return $date+$join+$time+$suffix
}
function Get-DateValue($Formula,$Context){
 $raw=if($Formula.mode -eq 'specific'){$Formula.value}else{$Context.baseDate}
 $date=[DateTime]::ParseExact([string]$raw,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)
 if($Formula.mode -eq 'offset'){$date=$date.AddDays([int]$Formula.days)}elseif($Formula.mode -eq 'business'){
  $holidays=@(([string]$Formula.holidays -split '[\s,;]+'|Where-Object{$_}));$tries=0
  do{$date=$date.AddDays(1);$tries++;if($tries -gt 3700){throw 'Não foi possível achar dia útil.'}}while($date.DayOfWeek -in @([DayOfWeek]::Saturday,[DayOfWeek]::Sunday) -or $holidays -contains $date.ToString('yyyy-MM-dd'))
 }
 $zone=[TimeZoneInfo]::FindSystemTimeZoneById('SA Eastern Standard Time')
 $reference=if($Context.referenceDateTime){[DateTimeOffset]::Parse($Context.referenceDateTime,[Globalization.CultureInfo]::InvariantCulture)}else{$script:DateReference}
 $local=[TimeZoneInfo]::ConvertTime($reference,$zone)
 $wall=[DateTime]::SpecifyKind($date.Date.Add($local.TimeOfDay),[DateTimeKind]::Unspecified)
 $instant=[DateTimeOffset]::new($wall,$zone.GetUtcOffset($wall))
 if($Formula.format -eq 'custom' -and $Formula.custom.timezone -and $Formula.custom.zone -eq 'utc'){$instant=$instant.ToUniversalTime()}
 return $instant.ToString((Get-DateMask $Formula),[Globalization.CultureInfo]::InvariantCulture)
}
function Get-Profile($Formula,$Context,[string]$Kind){$group=[string]$Formula.group;if(-not $group){$group='principal'};$cacheKey=$Kind+'|'+$group+'|'+[string]$Formula.state;if(-not $Context.profiles.ContainsKey($cacheKey)){
  $first=@('Ana','Marina','Clara','Beatriz','Camila','Luana','Helena','Sofia','Pedro','Lucas','Rafael','Bruno','Thiago','André','Mateus','Daniel');$last=@('Almeida','Barbosa','Carvalho','Costa','Ferreira','Lima','Martins','Oliveira','Pereira','Ribeiro','Santos','Souza')
  if($Kind -eq 'person'){$a=$first[(Random-Int 0 ($first.Count-1))];$b=$last[(Random-Int 0 ($last.Count-1))];$name="$a $b";$slug=($name.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}','').ToLowerInvariant() -replace '[^a-z0-9]+','.';$p=@{name=$name;firstName=$a;lastName=$b;email=($slug+(Random-Int 10 9999)+'@example.test')}}
  elseif($Kind -eq 'company'){$pfx=@('Aurora','Horizonte','Ipê','Solar','Atlântica','Nascente','Vereda','Candeia','Brisa','Cedro')[(Random-Int 0 9)];$sfx=@('Tecnologia','Serviços','Comércio','Logística','Alimentos','Soluções','Engenharia','Consultoria')[(Random-Int 0 7)];$trade="$pfx $sfx";$slug=($trade.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}','').ToLowerInvariant() -replace '[^a-z0-9]+','.';$p=@{tradeName=$trade;legalName="$trade LTDA";email=('contato.'+$slug+(Random-Int 10 9999)+'@example.test')}}
  else{$locations=@{AC='Rio Branco';AL='Maceió';AP='Macapá';AM='Manaus';BA='Salvador';CE='Fortaleza';DF='Brasília';ES='Vitória';GO='Goiânia';MA='São Luís';MT='Cuiabá';MS='Campo Grande';MG='Belo Horizonte';PA='Belém';PB='João Pessoa';PR='Curitiba';PE='Recife';PI='Teresina';RJ='Rio de Janeiro';RN='Natal';RS='Porto Alegre';RO='Porto Velho';RR='Boa Vista';SC='Florianópolis';SP='São Paulo';SE='Aracaju';TO='Palmas'};$states=@($locations.Keys);$uf=if($Formula.state -and $Formula.state -ne 'any'){$Formula.state}else{$states[(Random-Int 0 ($states.Count-1))]};if(-not $locations.ContainsKey($uf)){throw 'UF inválida.'};$street=@('Rua','Avenida','Travessa')[(Random-Int 0 2)]+' '+@('dos Ipês','das Acácias','do Horizonte','das Palmeiras','da Nascente','do Sol','das Flores','da Serra')[(Random-Int 0 7)];$number=[string](Random-Int 1 2500);$district=@('Centro','Jardim Primavera','Vila Nova','Boa Vista','Parque das Flores','Alto da Serra')[(Random-Int 0 5)];$zip=(Random-Text 5 '0123456789')+'-'+(Random-Text 3 '0123456789');$city=$locations[$uf];$p=@{street=$street;number=$number;district=$district;city=$city;state=$uf;zip=$zip;full="$street, $number - $district, $city/$uf, $zip"}}
  $Context.profiles[$cacheKey]=$p
};$field=[string]$Formula.field;if(-not $field){$field=switch($Kind){person{'name'};company{'legalName'};address{'street'}}};if(-not $Context.profiles[$cacheKey].ContainsKey($field)){throw 'Campo de perfil inválido.'};return [string]$Context.profiles[$cacheKey][$field]}
function Get-GroupValues($Formula,$Context){
 $group=@(Get-Segments ([string]$Formula.group))
 $recordPath=if($Formula.source -eq 'input'){$Context.inputGroup}else{$Context.outputGroup}
 $record=@(Get-Segments ([string]$recordPath))
 $inside=Starts-WithSegments $group $record
 $field=@(Get-Segments ([string]$Formula.path));$fieldInside=Starts-WithSegments $field $record
 $local=$Context.Clone();$local.aggregateSingle=($inside -and $group.Count -eq $record.Count)
 if(-not $Formula.allRecords -or (-not $inside -and -not $fieldInside)){Get-LocalGroupValues $Formula $local;return}
 if($Formula.source -eq 'input'){
  $first=Resolve-Absolute $Context.source ([string]$recordPath) $null 0
  $all=@(if($first){foreach($item in $first.ParentNode.ChildNodes){if($item -is [Xml.XmlElement] -and $item.LocalName -ceq $first.LocalName -and $item.NamespaceURI -ceq $first.NamespaceURI){$item}}})
 }else{$all=@($Context.records)}
 for($index=0;$index -lt $all.Count;$index++){
  $local.recordIndex=$index
  if($Formula.source -eq 'input'){$local.returnSource='all'}else{$local.currentRecord=$all[$index]}
  if(-not $inside -and $fieldInside){
   if(-not (Starts-WithSegments $field $group)){throw 'Escolha um campo dentro do grupo somado.'}
   $node=if($Formula.source -eq 'input'){Resolve-Absolute $Context.source ([string]$Formula.path) $Context.inputGroup $index}else{Resolve-Record $local.currentRecord ([string]$Formula.path) $Context.outputGroup}
   if(-not $node){throw 'Campo ausente em um registro do somatório.'}
   if($Formula.source -ne 'input' -and $null -ne $Context.jobs){Invoke-GeneratedNode $node $Context.jobs}else{Get-Value $node '' '' 0}
  }else{Get-LocalGroupValues $Formula $local}
 }
}
function Get-LocalGroupValues($Formula,$Context){
 $group=@(Get-Segments ([string]$Formula.group));$field=@(Get-Segments ([string]$Formula.path))
 if($field.Count -le $group.Count -or -not (Starts-WithSegments $field $group)){throw 'Escolha um campo dentro do grupo somado.'}
 if($Formula.source -eq 'input'){
  $sourceIndex=if($Context.returnSource -eq 'all'){$Context.recordIndex}else{0}
  $first=Resolve-Absolute $Context.source ([string]$Formula.group) $Context.inputGroup $sourceIndex
 }else{
  $first=$null
  if($Context.currentRecord){$first=Resolve-Record $Context.currentRecord ([string]$Formula.group) $Context.outputGroup}
  if(-not $first){$first=Resolve-Absolute $Context.output ([string]$Formula.group) $Context.outputGroup $Context.recordIndex}
 }
 if(-not $first){return}
 $items=if($Context.aggregateSingle){@($first)}else{@($first.ParentNode.ChildNodes)}
 foreach($item in $items){
  if(-not ($item -is [Xml.XmlElement]) -or $item.LocalName -cne $first.LocalName -or $item.NamespaceURI -cne $first.NamespaceURI){continue}
  $node=$item
  foreach($segment in $field[$group.Count..($field.Count-1)]){
   if($segment.attribute){$found=$null;foreach($attr in $node.Attributes){if($attr.LocalName -ceq $segment.name -and $attr.NamespaceURI -ceq $segment.ns){$found=$attr;break}};$node=$found}
   else{$matches=@(foreach($child in $node.ChildNodes){if($child -is [Xml.XmlElement] -and $child.LocalName -ceq $segment.name -and $child.NamespaceURI -ceq $segment.ns){$child}});$node=if([int]$segment.index -ge 1 -and [int]$segment.index -le $matches.Count){$matches[[int]$segment.index-1]}else{$null}}
   if($null -eq $node){throw 'Campo ausente em uma ocorrência do grupo somado.'}
  }
  if($Formula.source -ne 'input' -and $null -ne $Context.jobs){Invoke-GeneratedNode $node $Context.jobs}else{Get-Value $node '' '' 0}
 }
}
function Sum-DecimalValues($values){
 if(@($values).Count -eq 0){return '0'}
$precision=0;$parsed=@();foreach($v in $values){if($v -notmatch '^[-+]?\d+(\.\d+)?$'){throw 'Soma exige decimais válidos.'};$p=if($v.Contains('.')){$v.Split('.')[1].Length}else{0};if($p -gt 12){throw 'Soma aceita até 12 casas.'};$precision=[Math]::Max($precision,$p);$parsed+=,$v};$scale=[Numerics.BigInteger]::Pow([Numerics.BigInteger]10,$precision);$total=[Numerics.BigInteger]0;foreach($v in $parsed){$negative=$v.StartsWith('-');$digits=$v.TrimStart('+','-').Replace('.','');$part=[Numerics.BigInteger]::Parse($digits);$p=if($v.Contains('.')){$v.Split('.')[1].Length}else{0};$part*=[Numerics.BigInteger]::Pow([Numerics.BigInteger]10,$precision-$p);if($negative){$part=-$part};$total+=$part};$sign=if($total -lt 0){'-'}else{''};$digits=[Numerics.BigInteger]::Abs($total).ToString().PadLeft($precision+1,'0');if($precision -eq 0){return $sign+$digits};$fraction=$digits.Substring($digits.Length-$precision).TrimEnd('0');$whole=$digits.Substring(0,$digits.Length-$precision);if($fraction){return $sign+$whole+'.'+$fraction};return $sign+$whole
}
function Evaluate-Formula($Formula,$Context,[int]$Depth=0){if($Depth -gt 6){throw 'Composição excedeu seis níveis.'};switch -CaseSensitive ([string]$Formula.type){
  literal{return [string]$Formula.value}
  copy{$sourceIndex=if($Context.returnSource -eq 'all'){$Context.recordIndex}else{0};$node=Resolve-Absolute $Context.source ([string]$Formula.path) $Context.inputGroup $sourceIndex;if(-not $node){throw "Origem não encontrada: $($Formula.path)"};return Get-Value $node $Formula.path $Context.inputGroup $sourceIndex}
  field{if($Formula.source -eq 'input'){$sourceIndex=if($Context.returnSource -eq 'all'){$Context.recordIndex}else{0};$node=Resolve-Absolute $Context.source ([string]$Formula.path) $Context.inputGroup $sourceIndex}else{if($Context.currentRecord){$node=Resolve-Record $Context.currentRecord ([string]$Formula.path) $Context.outputGroup};if(-not $node){$node=Resolve-Absolute $Context.output ([string]$Formula.path) $Context.outputGroup $Context.recordIndex}};if(-not $node){throw "Campo não encontrado: $($Formula.path)"};if($Formula.source -ne 'input' -and $null -ne $Context.jobs){if(-not (Is-Connected $node $Context.output)){throw 'Campo de saída omitido.'};return Invoke-GeneratedNode $node $Context.jobs};return Get-Value $node $Formula.path '' 0}
  groupSum{$values=@(Get-GroupValues $Formula $Context);return Sum-DecimalValues $values}
  config{return ([string]$Context.configName -replace '\s+','')}
  count{return [string]$Context.count}
  cpf{return New-CPF ([bool]$Formula.mask)}
  cnpj{return New-CNPJ $Formula}
  list{$items=Get-List $Formula.values;if($Formula.mode -eq 'random'){return [string]$items[(Random-Int 0 ($items.Count-1))]};$index=if($null -eq $Formula.index){0}else{[int]$Formula.index};if($index -lt 0 -or $index -ge $items.Count){throw 'Posição fora da lista.'};return [string]$items[$index]}
  hash{$length=if($null -eq $Formula.length){32}else{[int]$Formula.length};$alphabet=switch ([string]$Formula.format){alphanumeric{'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'};HEX{'0123456789ABCDEF'};default{'0123456789abcdef'}};return Random-Text $length $alphabet}
  person{return Get-Profile $Formula $Context person}
  company{return Get-Profile $Formula $Context company}
  address{return Get-Profile $Formula $Context address}
  zeros{$length=if($null -eq $Formula.length){8}else{[int]$Formula.length};if($length -lt 1 -or $length -gt 1000){throw 'Comprimento de zeros inválido.'};return '0'*$length}
  sequence{$start=if($null -eq $Formula.start){1L}else{[long]$Formula.start};$step=if($null -eq $Formula.step){1L}else{[long]$Formula.step};$width=if($null -eq $Formula.width){4}else{[int]$Formula.width};$idx=if($Formula.scope -eq 'file'){$Context.fileIndex}else{$Context.recordIndex};$n=$start+$step*$idx;if($n -lt 0){throw 'Sequencial negativo não suportado.'};return ([string]$n).PadLeft($width,'0')}
  date{return Get-DateValue $Formula $Context}
  alpha{$length=if($null -eq $Formula.length){9}else{[int]$Formula.length};$alphabet=if($Formula.alphabet){[string]$Formula.alphabet}else{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'};return Random-Text $length $alphabet}
  random{$precision=if($null -eq $Formula.decimals){2}else{[int]$Formula.decimals};$factor=[long][Math]::Pow(10,$precision);$lo=[long][Math]::Ceiling(([decimal]$Formula.min)*$factor);$hi=[long][Math]::Floor(([decimal]$Formula.max)*$factor);if($hi -lt $lo -or [decimal]::Abs($lo) -gt 1000000000000 -or [decimal]::Abs($hi) -gt 1000000000000){throw 'Faixa aleatória inválida.'};$picked=Random-Int $lo $hi;$number=[decimal]$picked/$factor;return $number.ToString('F'+$precision,[Globalization.CultureInfo]::InvariantCulture)}
  id{if($Formula.mode -ne 'common'){return [Guid]::NewGuid().ToString('D')};$length=if($null -eq $Formula.length){12}else{[int]$Formula.length};$prefix=[string]$Formula.prefix;if((Get-CodePointCount $prefix) -gt $length){throw 'Prefixo maior que o ID.'};return $prefix+(Random-Text ($length-(Get-CodePointCount $prefix)) 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}
  compose{$parts=@($Formula.parts);if($parts.Count -eq 0){throw 'Composição vazia.'};$values=@(foreach($part in $parts){Evaluate-Formula $part $Context ($Depth+1)});if($Formula.operation -eq 'sum'){return Sum-DecimalValues $values};return [string]::Join([string]$Formula.separator,$values)}
  default{throw "Fórmula não suportada: $($Formula.type)"}
}}
function Invoke-GeneratedNode($Node,$Jobs){
 if(-not $Jobs.ContainsKey($Node)){return Get-Value $Node '' '' 0}
 $job=$Jobs[$Node]
 if($job.status -eq 'done'){return [string]$job.value}
 if($job.status -eq 'visiting'){throw "Dependência circular entre fórmulas: $($job.path)"}
 $job.status='visiting'
 try{
  $rule=$job.rule
  $value=if($null -ne $rule.fixed){[string]$rule.fixed}elseif($rule.generator){Evaluate-Formula $rule.generator $job.context}else{Get-Value $Node '' '' 0}
  $job.value=Check-Length ([string]$value) $rule.exactLength
  Set-NodeValue $Node $job.value
  $job.status='done'
  return [string]$job.value
 }catch{$job.status='pending';throw}
}
function Safe-Filename([string]$Name){$Name=$Name.Trim();if(-not $Name){throw 'Nome de arquivo vazio.'};if($Name.Length -gt 180 -or $Name -match '[<>:"/\\|?*\x00-\x1f]' -or $Name -match '[. ]$' -or $Name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)'){throw 'Nome de arquivo inválido.'};if($Name -notmatch '\.xml$'){$Name+='.xml'};return $Name}

try {
  if(-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)){[void](New-Item -ItemType Directory -Path $OutputDirectory -Force)}
  $config=$script:Config;$inputText=[string]$config.inputXml;if($InputFile){$info=Get-Item -LiteralPath $InputFile;if($info.Length -gt $script:MaxInputBytes){throw 'Amostra de entrada excede 2 MB.'};$inputText=[IO.File]::ReadAllText($info.FullName,[Text.Encoding]::UTF8)}
  $source=Read-Xml $inputText $script:MaxInputBytes;$mode=[string]$config.mode;$templateText=if($mode -eq 'new' -or -not $config.outputXml){[string]$config.inputXml}else{[string]$config.outputXml};$template=Read-Xml $templateText $script:MaxInputBytes
  $inputGroup=[string]$config.inputGroup;$outputGroup=if($mode -eq 'new'){$inputGroup}else{[string]$config.outputGroup};if(-not $inputGroup -or -not $outputGroup){throw 'Selecione os grupos de entrada e saída no MockAíZé antes de exportar.'}
  $sourceGroup=Resolve-Absolute $source $inputGroup $inputGroup 0;$targetGroup=Resolve-Absolute $template $outputGroup $outputGroup 0;if(-not $sourceGroup -or -not $targetGroup){throw 'Grupo configurado não existe nos XMLs.'}
  foreach($headerPath in $config.headersByMode.$mode){
    $header=Resolve-Absolute $template ([string]$headerPath) $null 0
    if(-not ($header -is [Xml.XmlElement])){throw "Cabeçalho não encontrado: $headerPath"}
    $headerSegments=@(Get-Segments ([string]$headerPath));$recordSegments=@(Get-Segments $outputGroup)
    if((Starts-WithSegments $headerSegments $recordSegments) -or (Starts-WithSegments $recordSegments $headerSegments)){throw 'O cabeçalho deve ficar fora da unidade repetida. Selecione a tag de registro no MockAíZé.'}
    $headerCount=0;foreach($sibling in $header.ParentNode.ChildNodes){if($sibling -is [Xml.XmlElement] -and $sibling.LocalName -ceq $header.LocalName -and $sibling.NamespaceURI -ceq $header.NamespaceURI){$headerCount++}}
    if($headerCount -ne 1){throw 'Mantenha uma única ocorrência de cada cabeçalho no modelo.'}
  }
  $records=New-Object 'System.Collections.Generic.List[Xml.XmlElement]';if($targetGroup -is [Xml.XmlElement]){$records.Add($targetGroup)}else{throw 'Grupo de saída não é um elemento XML.'}
  $available=1;if($sourceGroup.ParentNode){$available=0;foreach($n in $sourceGroup.ParentNode.ChildNodes){if($n -is [Xml.XmlElement] -and $n.LocalName -ceq $sourceGroup.LocalName -and $n.NamespaceURI -ceq $sourceGroup.NamespaceURI){$available++}}}
  $requested=if($Count -gt 0){$Count}else{[int]$config.recordCount};if($requested -lt 1 -or $requested -gt 500){throw 'Quantidade deve ficar entre 1 e 500.'};$total=if($mode -eq 'return'){$available}else{$requested};if($total -lt 1 -or $total -gt 500){throw 'A amostra de retorno precisa conter de 1 a 500 registros.'}
  $originalGroup=$outputGroup;$wrapper=$null
  if($targetGroup -eq $template.DocumentElement -and $total -gt 1){$oldRoot=$template.DocumentElement;$template.RemoveChild($oldRoot)|Out-Null;$wrapper=$template.CreateElement('MockRegistros');$template.AppendChild($wrapper)|Out-Null;$wrapper.AppendChild($oldRoot)|Out-Null;$targetGroup=$oldRoot;$records.Clear()}
  if($targetGroup -ne $template.DocumentElement){$parent=$targetGroup.ParentNode;$siblings=@(foreach($n in $parent.ChildNodes){if($n -is [Xml.XmlElement] -and $n.LocalName -ceq $targetGroup.LocalName -and $n.NamespaceURI -ceq $targetGroup.NamespaceURI){$n}});$anchor=$siblings[-1].NextSibling;foreach($n in $siblings){[void]$parent.RemoveChild($n)};$records.Clear();for($i=0;$i -lt $total;$i++){$copy=[Xml.XmlElement]$template.ImportNode($siblings[0],$true);if($null -ne $anchor){[void]$parent.InsertBefore($copy,$anchor)}else{[void]$parent.AppendChild($copy)};$records.Add($copy)}}else{for($i=1;$i -lt $total;$i++){$copy=[Xml.XmlElement]$template.ImportNode($targetGroup,$true);$template.DocumentElement.ParentNode.AppendChild($copy)|Out-Null;$records.Add($copy)}}
  if($records.Count -eq 0){$records.Add($targetGroup)}
  $rules=$config.rulesByMode.$mode;$presence=$config.presenceByMode.$mode;$contexts=New-Object 'System.Collections.Generic.List[object]'
  for($i=0;$i -lt $records.Count;$i++){$contexts.Add(@{record=$records[$i];index=$i;cache=@{}})}
  $jobs=@{};$allPolicies=New-Object 'System.Collections.Generic.List[object]';$orderedJobs=New-Object 'System.Collections.Generic.List[object]'
  for($i=0;$i -lt $records.Count;$i++){
    $ctx=$contexts[$i];$policyTargets=New-Object 'System.Collections.Generic.List[object]';$ruleTargets=New-Object 'System.Collections.Generic.List[object]'
    foreach($property in $presence.PSObject.Properties){$path=$property.Name;$policy=$property.Value;$node=Resolve-Record $ctx.record $path $originalGroup;if(-not $node -and $i -eq 0){$node=Resolve-Absolute $template $path $null 0};if($node){$policyTargets.Add(@{path=$path;policy=$policy;node=$node})}}
    foreach($property in $rules.PSObject.Properties){$path=$property.Name;if($i -gt 0 -and -not (Starts-WithSegments @(Get-Segments $path) @(Get-Segments $originalGroup))){continue};$rule=$property.Value;if(-not ($rule.generator -or $null -ne $rule.fixed -or $null -ne $rule.exactLength)){continue};$node=Resolve-Record $ctx.record $path $originalGroup;if(-not $node -and $i -eq 0){$node=Resolve-Absolute $template $path $null 0};if(-not $node){throw "Regra sem campo: $path"};$ruleTargets.Add(@{path=$path;rule=$rule;node=$node})}
    foreach($item in $policyTargets){$p=$item.policy;$omit=($p.requirement -eq 'optional' -and (($p.include -eq $false) -or ($p.distribution -eq 'alternate' -and ($i%2 -eq 1))));if($omit -and (Is-Connected $item.node $template)){Remove-Node $item.node}}
    $ctxEval=@{source=$source;output=$template;currentRecord=$ctx.record;inputGroup=$inputGroup;outputGroup=$outputGroup;returnSource=$(if($mode -eq 'return'){'all'}else{'first'});recordIndex=$i;fileIndex=$effectiveFileIndex;count=$total;configName=$config.name;baseDate=$effectiveBaseDate;profiles=$ctx.cache;jobs=$jobs;records=$records}
    foreach($item in $ruleTargets){$node=$item.node;if(-not (Is-Connected $node $template)){continue};$jobs[$node]=@{path=$item.path;rule=$item.rule;context=$ctxEval;status='pending';value=$null};$orderedJobs.Add($node)}
    foreach($item in $policyTargets){$allPolicies.Add($item)}
  }
  foreach($node in $orderedJobs){if(Is-Connected $node $template){$null=Invoke-GeneratedNode $node $jobs}}
  foreach($item in $allPolicies){if($item.policy.requirement -eq 'required' -and (Is-Connected $item.node $template) -and [string]$item.node.InnerText.Trim() -eq ''){throw "Campo obrigatório vazio: $($item.path)"}}
  foreach($headerPath in $config.headersByMode.$mode){if(-not (Resolve-Absolute $template ([string]$headerPath) $null 0)){throw 'O cabeçalho deve permanecer na saída. Revise a presença da tag e de seus grupos pais.'}}
  $filenameFormula=$config.filenameByMode.$mode;if(-not $filenameFormula){$filenameFormula=@{type='literal';value='mock'}};$fileCtx=@{source=$source;output=$template;currentRecord=$records[0];inputGroup=$inputGroup;outputGroup=$outputGroup;returnSource=$(if($mode -eq 'return'){'all'}else{'first'});recordIndex=0;fileIndex=$effectiveFileIndex;count=$total;configName=$config.name;baseDate=$effectiveBaseDate;profiles=@{};records=$records};$name=Safe-Filename (Evaluate-Formula $filenameFormula $fileCtx)
  $settings=New-Object Xml.XmlWriterSettings;$settings.Encoding=New-Object Text.UTF8Encoding($false);$settings.Indent=$true;$settings.IndentChars='  ';$settings.NewLineChars="`n";$settings.NewLineHandling=[Xml.NewLineHandling]::None
  $memory=New-Object IO.MemoryStream;$writer=[Xml.XmlWriter]::Create($memory,$settings);try{$template.Save($writer)}finally{$writer.Dispose()};$bytes=$memory.ToArray();$memory.Dispose();if($bytes.Length -gt $script:MaxOutputBytes){throw 'XML gerado excede 100 MB.'}
  $targetPath=[IO.Path]::GetFullPath((Join-Path $OutputDirectory $name));$base=[IO.Path]::GetFullPath($OutputDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar;if(-not $targetPath.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Nome de saída fora da pasta escolhida.'}
  $stream=$null;try{$stream=[IO.File]::Open($targetPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$publishedPath=$targetPath;$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{if($stream){$stream.Dispose()}}
  [Console]::Out.WriteLine("Arquivo criado: $targetPath");exit 0
} catch {
  if($publishedPath -and (Test-Path -LiteralPath $publishedPath)){Remove-Item -LiteralPath $publishedPath -Force -ErrorAction SilentlyContinue}
  [Console]::Error.WriteLine(('MockAíZé: '+$_.Exception.Message));exit 1
} finally { if($script:Rng){$script:Rng.Dispose()} }
'''

BAT = r'''@echo off
setlocal
powershell.exe -NoLogo -NoProfile -NonInteractive -File "%~dp0MockAize.ps1" -OutputDirectory "%~dp0"
exit /b %ERRORLEVEL%
'''


def create_bundle(variation_id: str, expected_revision: int) -> dict:
    item = storage.get_variation(variation_id)
    if item is None:
        raise KeyError("Variação não encontrada.")
    if isinstance(expected_revision, bool) or item["revision"] != expected_revision:
        raise RuntimeError("A variação mudou. Salve e tente exportar novamente.")
    config = storage.normalize_config(item["config"])
    if config["mode"] == "manual":
        raise ValueError("No modo Manual, exporte o XML de entrada preenchido.")
    serialized = json.dumps({**config, "name": item["name"], "fileIndex": item["file_index"]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ps1 = PS_ENGINE.replace("__CONFIG_B64__", base64.b64encode(serialized).decode("ascii")).encode("utf-8")
    bat = BAT.encode("ascii")
    bundle_id = str(uuid.uuid4())
    root = storage.data_directory() / "PowerShell"
    root.mkdir(parents=True, exist_ok=True)
    staging = root / ("." + bundle_id + ".staging")
    final = root / bundle_id
    staging.mkdir()
    try:
        for filename, body in (("MockAize.ps1", ps1), ("MockAize.bat", bat)):
            with (staging / filename).open("xb") as stream:
                stream.write(body); stream.flush(); os.fsync(stream.fileno())
        os.replace(staging, final)
        ps_hash, bat_hash = hashlib.sha256(ps1).hexdigest(), hashlib.sha256(bat).hexdigest()
        now = datetime.now(timezone.utc).isoformat()
        with storage.connect() as db:
            db.execute("INSERT INTO bundles(id,variation_id,ps1_sha256,bat_sha256,ps1_bytes,bat_bytes,created_at) VALUES(?,?,?,?,?,?,?)",
                       (bundle_id, variation_id, ps_hash, bat_hash, len(ps1), len(bat), now))
    except Exception:
        shutil.rmtree(staging, ignore_errors=True); shutil.rmtree(final, ignore_errors=True)
        raise
    return {"id": bundle_id, "createdAt": now, "ps1Sha256": ps_hash, "batSha256": bat_hash,
            "ps1Bytes": len(ps1), "batBytes": len(bat), "ps1Url": f"/api/bundles/{bundle_id}/ps1",
            "batUrl": f"/api/bundles/{bundle_id}/bat"}


def get_bundle_member(bundle_id: str, member: str) -> tuple[dict, bytes] | None:
    if member not in {"ps1", "bat"}:
        return None
    try:
        bundle_id = str(uuid.UUID(bundle_id))
    except (ValueError, AttributeError):
        return None
    with storage.connect() as db:
        row = db.execute("SELECT * FROM bundles WHERE id=?", (bundle_id,)).fetchone()
    if row is None:
        return None
    filename = "MockAize.ps1" if member == "ps1" else "MockAize.bat"
    path = storage.data_directory() / "PowerShell" / bundle_id / filename
    if not path.is_file():
        return None
    content = path.read_bytes()
    expected = row["ps1_sha256"] if member == "ps1" else row["bat_sha256"]
    if hashlib.sha256(content).hexdigest() != expected:
        return None
    return dict(row), content
